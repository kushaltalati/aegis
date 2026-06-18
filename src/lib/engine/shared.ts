// Shared building blocks for every LLM-backed engine (Gemini, Groq, …).
// One prompt, one response shape, one parser — so adding a provider only means
// wiring up its HTTP call, never re-deriving the moderation logic.

import { HARM_CATEGORIES, type HarmCategory } from "../categories";
import type {
  ClassificationInput,
  ClassificationResult,
  EngineName,
  OffendingSegment,
} from "../types";
import { clamp } from "../utils";

/** The JSON object every LLM engine must return. */
export type LlmPayload = {
  categories?: { category: string; confidence: number }[];
  segments?: { text: string; category: string; confidence: number }[];
  reasoning?: string;
};

/** Context-aware prompt fed to every LLM engine. */
export function buildPrompt(input: ClassificationInput): string {
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
        thread.map((m, i) => `  ${i + 1}. @${m.author}: ${m.text}`).join("\n"),
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

/**
 * Instructions for chat-completion engines (OpenAI-compatible: Groq, etc.) that
 * use a generic JSON mode rather than a provider-specific response schema.
 */
export const JSON_OUTPUT_INSTRUCTIONS = `Respond with ONLY a JSON object of this exact shape (no markdown, no prose):
{
  "categories": [{ "category": "<one of: ${HARM_CATEGORIES.join(
    " | ",
  )}>", "confidence": <0..1> }],
  "segments": [{ "text": "<verbatim offending substring>", "category": "<harm category>", "confidence": <0..1> }],
  "reasoning": "<2-4 sentences>"
}
Include an entry in "categories" for every category listed above.`;

/** Tolerant JSON parse — strips ```json fences some models wrap output in. */
export function parseLlmJson(raw: string): LlmPayload {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  return JSON.parse(cleaned) as LlmPayload;
}

function locateSegments(
  text: string,
  segs: NonNullable<LlmPayload["segments"]>,
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

/** Turn a parsed LLM payload into the engine-agnostic ClassificationResult. */
export function payloadToResult(
  input: ClassificationInput,
  payload: LlmPayload,
  engine: EngineName,
  latencyMs: number,
  rawExtra?: Record<string, unknown>,
): ClassificationResult {
  const scores = {} as Record<HarmCategory, number>;
  for (const c of HARM_CATEGORIES) scores[c] = 0;
  for (const entry of payload.categories ?? []) {
    if (HARM_CATEGORIES.includes(entry.category as HarmCategory)) {
      scores[entry.category as HarmCategory] = clamp(entry.confidence);
    }
  }
  return {
    engine,
    scores,
    segments: locateSegments(input.text, payload.segments ?? []),
    reasoning: payload.reasoning?.trim() || "No reasoning provided.",
    latencyMs,
    raw: { ...payload, ...rawExtra },
  };
}

/** Error carrying whether the failure is worth retrying on the same provider. */
export class ModelError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ModelError";
  }
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Exponential backoff with jitter: ~300ms, ~600ms, ~1200ms … */
export function backoffMs(attempt: number) {
  return 300 * 2 ** attempt + Math.floor(Math.random() * 200);
}
