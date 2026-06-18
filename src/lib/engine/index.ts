// Engine router. Resolves the engine choice from the global env override and the
// platform's policy, then runs an AI-first fallback chain:
//
//     Gemini  →  Groq (or any OpenAI-compatible LLM)  →  local engine
//
// The local lexical engine is only the LAST resort, used when no AI engine is
// configured or every AI engine fails — so a transient outage never silently
// downgrades moderation to keyword matching without saying so.

import type {
  ClassificationInput,
  ClassificationResult,
  EngineChoice,
  ModerationEngine,
} from "../types";
import { GeminiEngine } from "./gemini";
import { GroqEngine } from "./groq";
import { LocalEngine } from "./local";

const gemini = new GeminiEngine();
const groq = new GroqEngine();
const local = new LocalEngine();

/** AI engines in preference order. */
const AI_CHAIN: ModerationEngine[] = [gemini, groq];

export type EngineRun = {
  result: ClassificationResult;
  /** True if we did not run the most-preferred available engine. */
  fellBack: boolean;
  requested: EngineChoice;
};

function globalOverride(): EngineChoice {
  const v = (process.env.MODERATION_ENGINE || "auto").trim().toLowerCase();
  return v === "gemini" || v === "local" ? v : "auto";
}

export function resolveEngineChoice(policyEngine: EngineChoice): EngineChoice {
  const override = globalOverride();
  return override === "auto" ? policyEngine : override;
}

export function geminiAvailable() {
  return gemini.available();
}
export function groqAvailable() {
  return groq.available();
}
/** Any real AI engine configured? */
export function aiAvailable() {
  return AI_CHAIN.some((e) => e.available());
}

export async function runEngine(
  input: ClassificationInput,
  policyEngine: EngineChoice,
): Promise<EngineRun> {
  const choice = resolveEngineChoice(policyEngine);

  if (choice === "local") {
    return {
      result: await local.classify(input),
      fellBack: false,
      requested: choice,
    };
  }

  // AI-first chain. Try each available AI engine in order; the first success
  // wins. Note in the reasoning if we fell back past the top preference.
  const errors: string[] = [];
  let topPreference: string | null = null;

  for (const engine of AI_CHAIN) {
    if (!engine.available()) continue;
    if (topPreference === null) topPreference = engine.name;
    try {
      const result = await engine.classify(input);
      const fellBack = result.engine !== topPreference;
      if (fellBack) {
        result.reasoning = `[${topPreference} unavailable — ${result.engine} fallback] ${result.reasoning}`;
      }
      return { result, fellBack, requested: choice };
    } catch (err) {
      console.error(`[engine] ${engine.name} failed:`, err);
      errors.push(`${engine.name}: ${(err as Error).message}`);
    }
  }

  // Last resort: lexical local engine.
  const result = await local.classify(input);
  if (topPreference) {
    result.reasoning = `[AI engines unavailable — local fallback] ${result.reasoning}`;
  } else if (choice === "gemini") {
    result.reasoning = `[No AI engine configured — local fallback] ${result.reasoning}`;
  }
  return {
    result,
    fellBack: topPreference !== null || choice === "gemini",
    requested: choice,
  };
}
