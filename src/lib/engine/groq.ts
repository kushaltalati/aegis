// Secondary AI engine (OpenAI-compatible chat completions).
//
// Defaults to Groq — a genuinely free, fast, OpenAI-compatible API — but works
// with ANY OpenAI-compatible endpoint (OpenAI, Together, OpenRouter, a local
// Ollama, …) by setting the FALLBACK_LLM_* env vars. This is the preferred
// fallback when Gemini is unavailable: an actual AI, not the lexical engine.

import type {
  ClassificationInput,
  ClassificationResult,
  ModerationEngine,
} from "../types";
import {
  JSON_OUTPUT_INSTRUCTIONS,
  ModelError,
  backoffMs,
  buildPrompt,
  parseLlmJson,
  payloadToResult,
  sleep,
  type LlmPayload,
} from "./shared";

export class GroqEngine implements ModerationEngine {
  readonly name = "groq" as const;
  private apiKey: string;
  private base: string;
  private model: string;
  private maxRetries: number;

  constructor() {
    this.apiKey = process.env.FALLBACK_LLM_API_KEY?.trim() ?? "";
    this.base =
      process.env.FALLBACK_LLM_BASE_URL?.trim() ||
      "https://api.groq.com/openai/v1";
    this.model =
      process.env.FALLBACK_LLM_MODEL?.trim() || "llama-3.3-70b-versatile";
    this.maxRetries = Math.max(
      0,
      Number(process.env.FALLBACK_LLM_MAX_RETRIES ?? 2),
    );
  }

  available() {
    return this.apiKey.length > 0;
  }

  async classify(input: ClassificationInput): Promise<ClassificationResult> {
    if (!this.available())
      throw new Error("FALLBACK_LLM_API_KEY not configured");

    const start = typeof performance !== "undefined" ? performance.now() : 0;
    const prompt = `${buildPrompt(input)}\n\n${JSON_OUTPUT_INSTRUCTIONS}`;
    const errors: string[] = [];

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const payload = await this.call(prompt);
        const latencyMs = Math.round(
          (typeof performance !== "undefined" ? performance.now() : 0) - start,
        );
        return payloadToResult(input, payload, this.name, latencyMs, {
          model: this.model,
        });
      } catch (err) {
        const e = err as ModelError;
        errors.push(`try ${attempt + 1}: ${e.message}`);
        if (e.retryable && attempt < this.maxRetries) {
          await sleep(backoffMs(attempt));
          continue;
        }
        break;
      }
    }

    throw new Error(`${this.model} failed — ${errors.join(" | ")}`);
  }

  private async call(prompt: string): Promise<LlmPayload> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    let res: Response;
    try {
      res = await fetch(`${this.base}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "You are a strict trust & safety classifier. You output only a single JSON object and nothing else.",
            },
            { role: "user", content: prompt },
          ],
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
    const raw: string | undefined = json?.choices?.[0]?.message?.content;
    if (!raw) throw new ModelError("empty response", true);

    try {
      return parseLlmJson(raw);
    } catch {
      throw new ModelError("non-JSON output", true);
    }
  }
}
