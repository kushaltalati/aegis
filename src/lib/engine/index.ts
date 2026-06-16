// Engine router. Resolves which engine to run from the global env override and
// the platform's policy, and always degrades gracefully to the local engine if
// Gemini is unconfigured or fails.

import type {
  ClassificationInput,
  ClassificationResult,
  EngineChoice,
} from "../types";
import { GeminiEngine } from "./gemini";
import { LocalEngine } from "./local";

const local = new LocalEngine();
const gemini = new GeminiEngine();

export type EngineRun = {
  result: ClassificationResult;
  /** True if the requested engine was Gemini but we fell back to local. */
  fellBack: boolean;
  requested: EngineChoice;
};

function globalOverride(): EngineChoice {
  const v = (process.env.MODERATION_ENGINE || "auto").trim().toLowerCase();
  return v === "gemini" || v === "local" ? v : "auto";
}

/** Resolve the effective engine choice from the global override + platform policy. */
export function resolveEngineChoice(policyEngine: EngineChoice): EngineChoice {
  const override = globalOverride();
  return override === "auto" ? policyEngine : override;
}

export function geminiAvailable() {
  return gemini.available();
}

export async function runEngine(
  input: ClassificationInput,
  policyEngine: EngineChoice,
): Promise<EngineRun> {
  const choice = resolveEngineChoice(policyEngine);

  if (choice === "local") {
    return { result: await local.classify(input), fellBack: false, requested: choice };
  }

  // gemini or auto -> prefer Gemini when available, else local.
  if (gemini.available()) {
    try {
      return {
        result: await gemini.classify(input),
        fellBack: false,
        requested: choice,
      };
    } catch (err) {
      console.error("[engine] Gemini failed, falling back to local:", err);
      const result = await local.classify(input);
      result.reasoning = `[Gemini unavailable — local fallback] ${result.reasoning}`;
      return { result, fellBack: true, requested: choice };
    }
  }

  // Requested Gemini/auto but no key configured.
  const result = await local.classify(input);
  if (choice === "gemini") {
    result.reasoning = `[Gemini not configured — local fallback] ${result.reasoning}`;
  }
  return { result, fellBack: choice === "gemini", requested: choice };
}
