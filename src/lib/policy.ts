// Policy helpers: build defaults, and parse the DB-stored JSON into a typed
// PolicySnapshot the pipeline can reason over. Thresholds and toggles live in
// the database — this module never hardcodes routing behaviour.

import { HARM_CATEGORIES, type HarmCategory } from "./categories";
import type {
  CategoryPolicy,
  CustomRule,
  EngineChoice,
  PolicySnapshot,
} from "./types";

export function defaultCategoryConfig(): Record<HarmCategory, CategoryPolicy> {
  const cfg = {} as Record<HarmCategory, CategoryPolicy>;
  for (const c of HARM_CATEGORIES) cfg[c] = { enabled: true, weight: 1 };
  return cfg;
}

/** Shape of the PolicyConfig row as stored by Prisma (strings hold JSON). */
export type PolicyRow = {
  engine: string;
  autoBlockThreshold: number;
  reviewThreshold: number;
  historyWeight: number;
  categoryConfig: string;
  customRules: string;
};

function asEngineChoice(v: string): EngineChoice {
  return v === "gemini" || v === "local" ? v : "auto";
}

export function parsePolicy(row: PolicyRow): PolicySnapshot {
  let categoryConfig = defaultCategoryConfig();
  try {
    const parsed = JSON.parse(row.categoryConfig) as Record<
      string,
      Partial<CategoryPolicy>
    >;
    for (const c of HARM_CATEGORIES) {
      const p = parsed[c];
      categoryConfig[c] = {
        enabled: p?.enabled ?? true,
        weight: typeof p?.weight === "number" ? p.weight : 1,
        blockThreshold: p?.blockThreshold,
        reviewThreshold: p?.reviewThreshold,
      };
    }
  } catch {
    categoryConfig = defaultCategoryConfig();
  }

  let customRules: CustomRule[] = [];
  try {
    const parsed = JSON.parse(row.customRules);
    if (Array.isArray(parsed)) customRules = parsed as CustomRule[];
  } catch {
    customRules = [];
  }

  return {
    engine: asEngineChoice(row.engine),
    autoBlockThreshold: row.autoBlockThreshold,
    reviewThreshold: row.reviewThreshold,
    historyWeight: row.historyWeight,
    categoryConfig,
    customRules,
  };
}

export function enabledCategories(policy: PolicySnapshot): HarmCategory[] {
  return HARM_CATEGORIES.filter((c) => policy.categoryConfig[c].enabled);
}

export function serializePolicyForDb(policy: PolicySnapshot) {
  return {
    engine: policy.engine,
    autoBlockThreshold: policy.autoBlockThreshold,
    reviewThreshold: policy.reviewThreshold,
    historyWeight: policy.historyWeight,
    categoryConfig: JSON.stringify(policy.categoryConfig),
    customRules: JSON.stringify(policy.customRules),
  };
}
