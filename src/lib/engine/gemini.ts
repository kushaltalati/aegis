// Gemini-backed engine.
//
// Talks to Google's Generative Language API over REST (no SDK dependency) and
// requests a strict JSON response describing per-category confidence, the exact
// offending spans, and human-readable reasoning. It is context-aware: the
// platform, the author's history, and the conversation thread are all fed in,
// because the same sentence can be benign or harmful depending on context.

import { HARM_CATEGORIES, type HarmCategory } from "../categories";
import type {
  ClassificationInput,
  ClassificationResult,
  ModerationEngine,
  OffendingSegment,
} from "../types";
import { clamp } from "../utils";

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

type GeminiPayload = {
  categories?: { category: string; confidence: number }[];
  segments?: { text: string; category: string; confidence: number }[];
  reasoning?: string;
};

function buildPrompt(input: ClassificationInput): string {
  const { platform, author, thread, note, text } = input;

  const categoryGuide = HARM_CATEGORIES.map((c) => `- ${c}`).join("\n");

  const contextLines: string[] = [
    `Platform: "${platform.name}" (audience: ${platform.audience}).`,
    `Categories this platform moderates: ${
      platform.enabledCategories.join(", ") || "none"
    }.`,
  ];
  if (author) {
    contextLines.push(
      `Author @${author.handle}: trust score ${author.trustScore.toFixed(
        2,
      )}, ${author.priorViolations} prior violation(s), account age ${
        author.accountAgeDays
      } days.`,
    );
  }
  if (thread?.length) {
    contextLines.push(
      "Conversation thread leading up to the content:\n" +
        thread
          .map((m, i) => `  ${i + 1}. @${m.author}: ${m.text}`)
          .join("\n"),
    );
  }
  if (note) contextLines.push(`Moderator note: ${note}`);

  return `You are a senior trust & safety classifier. Analyse the CONTENT below for these harm categories:
${categoryGuide}

For EVERY category, output a confidence from 0.0 (definitely not present) to 1.0 (definitely present).
Use the CONTEXT to disambiguate — the same words can be harmful or harmless depending on platform, audience, author intent, and the surrounding conversation. For example, clinical discussion, quoting to condemn, or satire among adults differs from a direct threat to a child.

For "segments", copy the EXACT offending substrings verbatim from the content (do not paraphrase). If nothing is offending, return an empty array.

CONTEXT:
${contextLines.join("\n")}

CONTENT:
"""
${text}
"""`;
}

function locateSegments(
  text: string,
  segs: { text: string; category: string; confidence: number }[],
): OffendingSegment[] {
  const out: OffendingSegment[] = [];
  for (const s of segs) {
    if (!s.text || !HARM_CATEGORIES.includes(s.category as HarmCategory))
      continue;
    const start = text.indexOf(s.text);
    out.push({
      text: s.text,
      start,
      end: start === -1 ? -1 : start + s.text.length,
      category: s.category as HarmCategory,
      confidence: clamp(s.confidence),
    });
  }
  return out;
}

export class GeminiEngine implements ModerationEngine {
  readonly name = "gemini" as const;
  private apiKey: string;
  private model: string;
  private base: string;

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY?.trim() ?? "";
    this.model = process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash";
    this.base =
      process.env.GEMINI_API_BASE?.trim() ||
      "https://generativelanguage.googleapis.com/v1beta";
  }

  available() {
    return this.apiKey.length > 0;
  }

  async classify(input: ClassificationInput): Promise<ClassificationResult> {
    if (!this.available()) {
      throw new Error("GEMINI_API_KEY not configured");
    }

    const start =
      typeof performance !== "undefined" ? performance.now() : 0;
    const url = `${this.base}/models/${this.model}:generateContent?key=${this.apiKey}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildPrompt(input) }] }],
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA,
          },
        }),
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Gemini API ${res.status}: ${body.slice(0, 300)}`);
    }

    const json = await res.json();
    const raw: string | undefined =
      json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) throw new Error("Gemini returned no content");

    let parsed: GeminiPayload;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("Gemini returned non-JSON output");
    }

    const scores = {} as Record<HarmCategory, number>;
    for (const c of HARM_CATEGORIES) scores[c] = 0;
    for (const entry of parsed.categories ?? []) {
      if (HARM_CATEGORIES.includes(entry.category as HarmCategory)) {
        scores[entry.category as HarmCategory] = clamp(entry.confidence);
      }
    }

    const latencyMs = Math.round(
      (typeof performance !== "undefined" ? performance.now() : 0) - start,
    );

    return {
      engine: this.name,
      scores,
      segments: locateSegments(input.text, parsed.segments ?? []),
      reasoning: parsed.reasoning?.trim() || "No reasoning provided.",
      latencyMs,
      raw: parsed,
    };
  }
}
