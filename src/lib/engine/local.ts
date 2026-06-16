// Deterministic fallback engine.
//
// Scores content against the weighted lexicon in categories.ts. It never calls
// out to a network, so the whole pipeline runs (and demos) with no API key.
// It is context-light by design — that nuance is what the Gemini engine adds.

import {
  CATEGORY_LEXICON,
  HARM_CATEGORIES,
  type HarmCategory,
} from "../categories";
import type {
  ClassificationInput,
  ClassificationResult,
  ModerationEngine,
  OffendingSegment,
} from "../types";
import { clamp } from "../utils";

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Saturating map from accumulated signal weight to a 0..1 confidence. */
function saturate(signal: number) {
  return clamp(1 - Math.exp(-1.25 * signal));
}

function nowMs() {
  // performance.now avoids the Date.now restriction and is monotonic.
  return typeof performance !== "undefined" ? performance.now() : 0;
}

export class LocalEngine implements ModerationEngine {
  readonly name = "local" as const;

  available() {
    return true; // always available
  }

  async classify(input: ClassificationInput): Promise<ClassificationResult> {
    const start = nowMs();
    const text = input.text;
    const lower = text.toLowerCase();

    const scores = {} as Record<HarmCategory, number>;
    const segments: OffendingSegment[] = [];
    const hitSummary: string[] = [];

    for (const category of HARM_CATEGORIES) {
      let signal = 0;
      const matchedTerms: string[] = [];

      for (const { term, weight, phrase } of CATEGORY_LEXICON[category]) {
        const termLower = term.toLowerCase();
        if (phrase) {
          let idx = lower.indexOf(termLower);
          while (idx !== -1) {
            signal += weight;
            matchedTerms.push(term);
            segments.push({
              text: text.slice(idx, idx + term.length),
              start: idx,
              end: idx + term.length,
              category,
              confidence: clamp(weight),
            });
            idx = lower.indexOf(termLower, idx + term.length);
          }
        } else {
          const re = new RegExp(`\\b${escapeRegExp(termLower)}\\b`, "gi");
          let m: RegExpExecArray | null;
          while ((m = re.exec(lower)) !== null) {
            signal += weight;
            matchedTerms.push(term);
            segments.push({
              text: text.slice(m.index, m.index + term.length),
              start: m.index,
              end: m.index + term.length,
              category,
              confidence: clamp(weight),
            });
          }
        }
      }

      const confidence = saturate(signal);
      scores[category] = confidence;
      if (confidence > 0.05 && matchedTerms.length) {
        hitSummary.push(
          `${category.replace(/_/g, " ")} (${(confidence * 100).toFixed(
            0,
          )}%) via "${[...new Set(matchedTerms)].slice(0, 3).join('", "')}"`,
        );
      }
    }

    const reasoning =
      hitSummary.length > 0
        ? `Lexical analysis matched: ${hitSummary.join("; ")}.`
        : "Lexical analysis found no strong signals for any harm category.";

    return {
      engine: this.name,
      scores,
      segments,
      reasoning,
      latencyMs: Math.round(nowMs() - start),
      raw: { matchedSegments: segments.length },
    };
  }
}
