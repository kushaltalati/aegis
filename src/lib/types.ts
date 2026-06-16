import type { HarmCategory } from "./categories";

// ---- Engine contracts ------------------------------------------------------

export type ModerationAction = "ALLOW" | "BLOCK" | "REVIEW";
export type ReviewPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type EngineName = "gemini" | "local";
export type EngineChoice = "auto" | "gemini" | "local";

/** A thread message used to give the engine conversational context. */
export type ThreadMessage = { author: string; text: string };

/** Everything an engine needs to classify in context. */
export type ClassificationInput = {
  text: string;
  platform: {
    name: string;
    audience: string;
    enabledCategories: HarmCategory[];
  };
  author?: {
    handle: string;
    trustScore: number;
    priorViolations: number;
    accountAgeDays: number;
  } | null;
  thread?: ThreadMessage[];
  note?: string;
};

/** A specific span of the input that triggered a category. */
export type OffendingSegment = {
  text: string;
  start: number;
  end: number;
  category: HarmCategory;
  confidence: number;
};

/** Raw, policy-agnostic engine output: confidence per category + evidence. */
export type ClassificationResult = {
  engine: EngineName;
  // category -> confidence (0..1) that the content violates that category
  scores: Record<HarmCategory, number>;
  segments: OffendingSegment[];
  reasoning: string;
  latencyMs: number;
  // Raw provider payload kept for the audit trail.
  raw?: unknown;
};

export interface ModerationEngine {
  readonly name: EngineName;
  available(): boolean;
  classify(input: ClassificationInput): Promise<ClassificationResult>;
}

// ---- Policy ----------------------------------------------------------------

export type CategoryPolicy = {
  enabled: boolean;
  weight: number; // multiplier on the category's contribution (0..1+)
  blockThreshold?: number; // per-category override of the global block threshold
  reviewThreshold?: number; // per-category override of the global review threshold
};

export type CustomRule = {
  id: string;
  name: string;
  description: string;
  pattern: string; // matched case-insensitively as a regular expression
  category: HarmCategory;
  action: ModerationAction; // forced action when the rule matches
  enabled: boolean;
};

export type PolicySnapshot = {
  engine: EngineChoice;
  autoBlockThreshold: number;
  reviewThreshold: number;
  historyWeight: number;
  categoryConfig: Record<HarmCategory, CategoryPolicy>;
  customRules: CustomRule[];
};

// ---- Pipeline output -------------------------------------------------------

export type ScoredCategory = {
  category: HarmCategory;
  confidence: number; // post-weight confidence used for routing
  rawConfidence: number; // engine confidence before policy weighting
  severity: number; // confidence * category base severity
  enabled: boolean;
  triggeredRule?: string;
};

export type PipelineDecision = {
  action: ModerationAction;
  status: "FINAL" | "PENDING_REVIEW";
  engine: EngineName;
  topCategory: HarmCategory | null;
  overallConfidence: number;
  severity: number;
  reasoning: string;
  segments: OffendingSegment[];
  scores: ScoredCategory[];
  priority: ReviewPriority;
  latencyMs: number;
  // Human-readable trace of *why* the routing landed where it did.
  routingTrace: string[];
  raw?: unknown;
};
