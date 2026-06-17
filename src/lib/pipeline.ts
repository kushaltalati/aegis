// The moderation pipeline.
//
//   raw engine scores
//     -> per-category policy (toggle + weight)
//     -> context escalation from author history
//     -> custom-rule overrides
//     -> confidence-based routing against thresholds
//     -> action + review priority + an auditable routing trace
//
// Every number that influences routing comes from the PolicySnapshot, so a
// platform's behaviour is entirely a function of its configuration.

import { CATEGORY_META, HARM_CATEGORIES, type HarmCategory } from "./categories";
import { runEngine } from "./engine";
import type {
  ClassificationInput,
  ModerationAction,
  PipelineDecision,
  PolicySnapshot,
  ReviewPriority,
  ScoredCategory,
} from "./types";
import { clamp, pct } from "./utils";

const ACTION_RANK: Record<ModerationAction, number> = {
  ALLOW: 0,
  REVIEW: 1,
  BLOCK: 2,
};

function strongest(a: ModerationAction, b: ModerationAction): ModerationAction {
  return ACTION_RANK[a] >= ACTION_RANK[b] ? a : b;
}

function safeRegex(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern, "i");
  } catch {
    return null;
  }
}

function priorityFor(severity: number, hasSelfHarm: boolean): ReviewPriority {
  if (hasSelfHarm) return "URGENT";
  if (severity >= 0.8) return "URGENT";
  if (severity >= 0.6) return "HIGH";
  if (severity >= 0.4) return "MEDIUM";
  return "LOW";
}

export async function runPipeline(
  input: ClassificationInput,
  policy: PolicySnapshot,
): Promise<PipelineDecision> {
  const trace: string[] = [];

  const { result, fellBack, requested } = await runEngine(input, policy.engine);
  trace.push(
    `Engine: ${result.engine}${
      fellBack ? ` (fell back from "${requested}")` : ""
    }.`,
  );

  // --- Author-history escalation factor (context-aware) ---------------------
  const trust = input.author?.trustScore ?? 0.6;
  const historyFactor = 1 + policy.historyWeight * (1 - trust);
  if (input.author && policy.historyWeight > 0) {
    trace.push(
      `Author @${input.author.handle} trust ${trust.toFixed(
        2,
      )} → history escalation ×${historyFactor.toFixed(2)}.`,
    );
  }

  // --- Custom-rule pass -----------------------------------------------------
  const ruleHitsByCategory = new Map<HarmCategory, string>();
  let forcedBlock = false;
  let forcedReview = false;
  let allowOverride = false;
  for (const rule of policy.customRules) {
    if (!rule.enabled) continue;
    const re = safeRegex(rule.pattern);
    if (!re || !re.test(input.text)) continue;
    ruleHitsByCategory.set(rule.category, rule.name);
    if (rule.action === "BLOCK") forcedBlock = true;
    else if (rule.action === "REVIEW") forcedReview = true;
    else if (rule.action === "ALLOW") allowOverride = true;
    trace.push(
      `Custom rule "${rule.name}" matched → forces ${rule.action} (${rule.category}).`,
    );
  }

  // --- Score each category against policy -----------------------------------
  const scored: ScoredCategory[] = [];
  let categoryAction: ModerationAction = "ALLOW";
  let topCategory: HarmCategory | null = null;
  let topConfidence = 0;
  let maxSeverity = 0;
  let hasSelfHarmSignal = false;

  for (const category of HARM_CATEGORIES) {
    const cp = policy.categoryConfig[category];
    const rawConfidence = result.scores[category] ?? 0;

    if (!cp.enabled) {
      scored.push({
        category,
        confidence: 0,
        rawConfidence,
        severity: 0,
        enabled: false,
        triggeredRule: ruleHitsByCategory.get(category),
      });
      continue;
    }

    const weighted = clamp(rawConfidence * cp.weight);
    const adjusted = clamp(weighted * historyFactor);
    const severity = clamp(adjusted * CATEGORY_META[category].baseSeverity);

    const blockT = cp.blockThreshold ?? policy.autoBlockThreshold;
    const reviewT = cp.reviewThreshold ?? policy.reviewThreshold;

    let catAction: ModerationAction = "ALLOW";
    if (adjusted >= blockT) catAction = "BLOCK";
    else if (adjusted >= reviewT) catAction = "REVIEW";

    if (catAction !== "ALLOW") {
      trace.push(
        `${CATEGORY_META[category].label}: ${pct(adjusted)} ≥ ${pct(
          catAction === "BLOCK" ? blockT : reviewT,
        )} → ${catAction}.`,
      );
    }

    categoryAction = strongest(categoryAction, catAction);
    if (category === "self_harm" && adjusted >= reviewT)
      hasSelfHarmSignal = true;
    if (adjusted > topConfidence) {
      topConfidence = adjusted;
      topCategory = category;
    }
    maxSeverity = Math.max(maxSeverity, severity);

    scored.push({
      category,
      confidence: adjusted,
      rawConfidence,
      severity,
      enabled: true,
      triggeredRule: ruleHitsByCategory.get(category),
    });
  }

  // --- Combine policy verdict with rule overrides ---------------------------
  let action = categoryAction;
  if (forcedReview) action = strongest(action, "REVIEW");
  if (forcedBlock) {
    action = "BLOCK";
  } else if (allowOverride && action !== "BLOCK") {
    action = "ALLOW";
    trace.push("Allowlist rule overrides routing → ALLOW.");
  }

  if (action === "ALLOW" && topCategory) {
    trace.push(
      `Top signal ${CATEGORY_META[topCategory].label} ${pct(
        topConfidence,
      )} below review threshold → ALLOW.`,
    );
  }

  const status = action === "REVIEW" ? "PENDING_REVIEW" : "FINAL";
  const priority = priorityFor(maxSeverity, hasSelfHarmSignal);

  return {
    action,
    status,
    engine: result.engine,
    topCategory: action === "ALLOW" ? topCategory : topCategory,
    overallConfidence: topConfidence,
    severity: maxSeverity,
    reasoning: result.reasoning,
    segments: result.segments,
    scores: scored,
    priority,
    latencyMs: result.latencyMs,
    routingTrace: trace,
    raw: result.raw,
  };
}
