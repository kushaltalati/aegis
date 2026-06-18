// Gemini-backed engine.
//
// Talks to Google's Generative Language API over REST (no SDK dependency) and
// requests a strict JSON response describing per-category confidence, the exact
// offending spans, and human-readable reasoning. Context-aware: platform,
// author history, and conversation thread are all fed in.

import { HARM_CATEGORIES } from "../categories";
import type {
  ClassificationInput,
  ClassificationResult,
  ModerationEngine,
} from "../types";
import {
  ModelError,
  backoffMs,
  buildPrompt,
  payloadToResult,
  sleep,
  type LlmPayload,
} from "./shared";

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    categories: {
      type: "ARRAY",
      description: "One entry per harm category with a 0..1 confidence.",
      items: {
        type: "OBJECT",
        properties: {
          category: { type: "STRING", enum: [...HARM_CATEGORIES] },
          confidence: { type: "NUMBER" },
        },
        required: ["category", "confidence"],
      },
    },
    segments: {
      type: "ARRAY",
      description:
        "Exact substrings copied verbatim from the content that triggered a category.",
      items: {
        type: "OBJECT",
        properties: {
          text: { type: "STRING" },
          category: { type: "STRING", enum: [...HARM_CATEGORIES] },
          confidence: { type: "NUMBER" },
        },
        required: ["text", "category", "confidence"],
      },
    },
    reasoning: {
      type: "STRING",
      description:
        "2-4 sentences explaining the decision, explicitly referencing context where relevant.",
    },
  },
  required: ["categories", "segments", "reasoning"],
};

export class GeminiEngine implements ModerationEngine {
  readonly name = "gemini" as const;
  private apiKey: string;
  private models: string[];
  private base: string;
  private maxRetries: number;

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY?.trim() ?? "";
    this.base =
      process.env.GEMINI_API_BASE?.trim() ||
      "https://generativelanguage.googleapis.com/v1beta";
    this.maxRetries = Math.max(0, Number(process.env.GEMINI_MAX_RETRIES ?? 2));

    const primary = process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash";
    this.models = [
      ...new Set([
        primary,
        "gemini-2.0-flash",
        "gemini-2.5-flash",
        "gemini-1.5-flash",
        "gemini-2.0-flash-lite",
      ]),
    ];
  }

  available() {
    return this.apiKey.length > 0;
  }

  async classify(input: ClassificationInput): Promise<ClassificationResult> {
    if (!this.available()) throw new Error("GEMINI_API_KEY not configured");

    const start = typeof performance !== "undefined" ? performance.now() : 0;
    const prompt = buildPrompt(input);
    const errors: string[] = [];

    for (const model of this.models) {
      for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
        try {
          const payload = await this.callModel(model, prompt);
          const latencyMs = Math.round(
            (typeof performance !== "undefined" ? performance.now() : 0) -
              start,
          );
          return payloadToResult(input, payload, this.name, latencyMs, {
            model,
          });
        } catch (err) {
          const e = err as ModelError;
          errors.push(`${model} (try ${attempt + 1}): ${e.message}`);
          if (e.retryable && attempt < this.maxRetries) {
            await sleep(backoffMs(attempt));
            continue;
          }
          break;
        }
      }
    }

    throw new Error(`All Gemini models failed — ${errors.join(" | ")}`);
  }

  private async callModel(model: string, prompt: string): Promise<LlmPayload> {
    const url = `${this.base}/models/${model}:generateContent?key=${this.apiKey}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA,
          },
        }),
      });
    } catch (err) {
      throw new ModelError(
        err instanceof Error ? err.message : "network error",
        true,
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const retryable = res.status === 429 || res.status >= 500;
      throw new ModelError(`HTTP ${res.status} ${body.slice(0, 160)}`, retryable);
    }

    const json = await res.json();
    const raw: string | undefined =
      json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) throw new ModelError("empty response", true);

    try {
      return JSON.parse(raw) as LlmPayload;
    } catch {
      throw new ModelError("non-JSON output", true);
    }
  }
}
