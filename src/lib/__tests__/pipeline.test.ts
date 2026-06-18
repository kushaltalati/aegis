// Unit tests for the pure policy-application + confidence-based routing logic in
// runPipeline. The engine layer (runEngine) is mocked so each test controls the
// raw per-category confidences directly — no AI calls, no Prisma, no database.
//
// Routing recap (see pipeline.ts):
//   weighted   = clamp(rawConfidence * categoryWeight)
//   adjusted   = clamp(weighted * historyFactor)
//   historyFactor = 1 + historyWeight * (1 - authorTrust)   (trust defaults to 0.6)
//   adjusted >= blockThreshold  -> BLOCK
//   adjusted >= reviewThreshold -> REVIEW
//   otherwise                   -> ALLOW
// Custom regex rules can force BLOCK/REVIEW or ALLOW-override the verdict.

import { beforeEach, describe, expect, it, vi } from "vitest";

import { HARM_CATEGORIES, type HarmCategory } from "@/lib/categories";
import { defaultCategoryConfig } from "@/lib/policy";
import type {
  CategoryPolicy,
  ClassificationInput,
  ClassificationResult,
  CustomRule,
  PolicySnapshot,
} from "@/lib/types";

// vi.mock is hoisted above imports, so the mock fn must come from vi.hoisted.
const { runEngineMock } = vi.hoisted(() => ({ runEngineMock: vi.fn() }));
vi.mock("@/lib/engine", () => ({ runEngine: runEngineMock }));

// Imported after the mock is registered so it binds to the mocked runEngine.
import { runPipeline } from "@/lib/pipeline";

// ---- Test helpers ----------------------------------------------------------

/** A full engine result with the given category confidences (rest default 0). */
function engineResult(
  scores: Partial<Record<HarmCategory, number>>,
): ClassificationResult {
  const full = {} as Record<HarmCategory, number>;
  for (const c of HARM_CATEGORIES) full[c] = scores[c] ?? 0;
  return {
    engine: "local",
    scores: full,
    segments: [],
    reasoning: "mocked",
    latencyMs: 1,
    raw: null,
  };
}

/** Make runEngine resolve with the given raw category confidences. */
function mockEngine(scores: Partial<Record<HarmCategory, number>>) {
  runEngineMock.mockResolvedValue({
    result: engineResult(scores),
    fellBack: false,
    requested: "local",
  });
}

function makePolicy(
  overrides: Partial<
    Omit<PolicySnapshot, "categoryConfig">
  > & {
    categoryOverrides?: Partial<Record<HarmCategory, Partial<CategoryPolicy>>>;
  } = {},
): PolicySnapshot {
  const categoryConfig = defaultCategoryConfig();
  for (const [cat, ov] of Object.entries(overrides.categoryOverrides ?? {})) {
    categoryConfig[cat as HarmCategory] = {
      ...categoryConfig[cat as HarmCategory],
      ...ov,
    };
  }
  return {
    engine: overrides.engine ?? "local",
    autoBlockThreshold: overrides.autoBlockThreshold ?? 0.85,
    reviewThreshold: overrides.reviewThreshold ?? 0.45,
    // Default to 0 so threshold tests are isolated from history escalation.
    historyWeight: overrides.historyWeight ?? 0,
    categoryConfig,
    customRules: overrides.customRules ?? [],
  };
}

function makeInput(
  text: string,
  author?: ClassificationInput["author"],
): ClassificationInput {
  return {
    text,
    platform: {
      name: "TestPlatform",
      audience: "general",
      enabledCategories: [...HARM_CATEGORIES],
    },
    author: author ?? null,
  };
}

const rule = (over: Partial<CustomRule> = {}): CustomRule => ({
  id: "r1",
  name: "Test rule",
  description: "",
  pattern: "forbidden",
  category: "harassment",
  action: "REVIEW",
  enabled: true,
  ...over,
});

beforeEach(() => {
  runEngineMock.mockReset();
});

// ---- Confidence-based routing ---------------------------------------------

describe("confidence-based routing against thresholds", () => {
  it("routes a high-confidence signal to BLOCK", async () => {
    mockEngine({ hate_speech: 0.9 });
    const res = await runPipeline(makeInput("x"), makePolicy());

    expect(res.action).toBe("BLOCK");
    expect(res.topCategory).toBe("hate_speech");
    expect(res.overallConfidence).toBeCloseTo(0.9, 5);
    expect(res.status).toBe("FINAL");
  });

  it("routes a mid-band signal to REVIEW (and marks it pending)", async () => {
    mockEngine({ harassment: 0.6 });
    const res = await runPipeline(makeInput("x"), makePolicy());

    expect(res.action).toBe("REVIEW");
    expect(res.topCategory).toBe("harassment");
    expect(res.status).toBe("PENDING_REVIEW");
  });

  it("routes a low-confidence signal to ALLOW", async () => {
    mockEngine({ harassment: 0.2 });
    const res = await runPipeline(makeInput("x"), makePolicy());

    expect(res.action).toBe("ALLOW");
    expect(res.status).toBe("FINAL");
  });

  it("treats the thresholds as inclusive lower bounds (>=)", async () => {
    mockEngine({ spam: 0.85 });
    expect((await runPipeline(makeInput("x"), makePolicy())).action).toBe(
      "BLOCK",
    );

    mockEngine({ spam: 0.45 });
    expect((await runPipeline(makeInput("x"), makePolicy())).action).toBe(
      "REVIEW",
    );
  });

  it("takes the strongest action across multiple categories", async () => {
    mockEngine({ spam: 0.5, hate_speech: 0.95 });
    const res = await runPipeline(makeInput("x"), makePolicy());

    expect(res.action).toBe("BLOCK");
    expect(res.topCategory).toBe("hate_speech");
  });
});

// ---- Category toggles ------------------------------------------------------

describe("category toggles", () => {
  it("ignores a disabled category even at max confidence", async () => {
    mockEngine({ hate_speech: 0.99 });
    const res = await runPipeline(
      makeInput("x"),
      makePolicy({ categoryOverrides: { hate_speech: { enabled: false } } }),
    );

    expect(res.action).toBe("ALLOW");
    expect(res.topCategory).toBeNull();
    expect(res.overallConfidence).toBe(0);

    const hate = res.scores.find((s) => s.category === "hate_speech");
    expect(hate?.enabled).toBe(false);
    expect(hate?.confidence).toBe(0);
  });

  it("still routes other enabled categories when one is disabled", async () => {
    mockEngine({ adult_content: 0.99, harassment: 0.9 });
    const res = await runPipeline(
      makeInput("x"),
      makePolicy({ categoryOverrides: { adult_content: { enabled: false } } }),
    );

    expect(res.action).toBe("BLOCK");
    expect(res.topCategory).toBe("harassment");
  });
});

// ---- Category weights ------------------------------------------------------

describe("category weight changes the effective score", () => {
  it("escalates routing when the weight amplifies the signal", async () => {
    // raw 0.5 with weight 1 lands in REVIEW...
    mockEngine({ harassment: 0.5 });
    expect((await runPipeline(makeInput("x"), makePolicy())).action).toBe(
      "REVIEW",
    );

    // ...the same raw signal with weight 1.8 (-> 0.9) crosses the block line.
    mockEngine({ harassment: 0.5 });
    const res = await runPipeline(
      makeInput("x"),
      makePolicy({ categoryOverrides: { harassment: { weight: 1.8 } } }),
    );
    expect(res.action).toBe("BLOCK");
    expect(res.overallConfidence).toBeCloseTo(0.9, 5);
  });

  it("de-escalates routing when the weight dampens the signal", async () => {
    // raw 0.6 * weight 0.5 = 0.3, below the review threshold.
    mockEngine({ harassment: 0.6 });
    const res = await runPipeline(
      makeInput("x"),
      makePolicy({ categoryOverrides: { harassment: { weight: 0.5 } } }),
    );

    expect(res.action).toBe("ALLOW");
    expect(res.overallConfidence).toBeCloseTo(0.3, 5);
  });
});

// ---- Custom regex rules ----------------------------------------------------

describe("custom regex rules", () => {
  it("forces REVIEW when a REVIEW rule matches, even with zero scores", async () => {
    mockEngine({});
    const res = await runPipeline(
      makeInput("this contains a forbidden phrase"),
      makePolicy({ customRules: [rule({ action: "REVIEW" })] }),
    );

    expect(res.action).toBe("REVIEW");
    const harassment = res.scores.find((s) => s.category === "harassment");
    expect(harassment?.triggeredRule).toBe("Test rule");
  });

  it("forces BLOCK when a BLOCK rule matches", async () => {
    mockEngine({ spam: 0.1 });
    const res = await runPipeline(
      makeInput("the forbidden word is here"),
      makePolicy({ customRules: [rule({ action: "BLOCK" })] }),
    );

    expect(res.action).toBe("BLOCK");
  });

  it("matches case-insensitively", async () => {
    mockEngine({});
    const res = await runPipeline(
      makeInput("FORBIDDEN, shouting"),
      makePolicy({ customRules: [rule({ action: "REVIEW" })] }),
    );

    expect(res.action).toBe("REVIEW");
  });

  it("lets an ALLOW rule override a REVIEW verdict (allowlist)", async () => {
    mockEngine({ harassment: 0.6 }); // would be REVIEW on its own
    const res = await runPipeline(
      makeInput("gg good game, forbidden banter"),
      makePolicy({ customRules: [rule({ action: "ALLOW" })] }),
    );

    expect(res.action).toBe("ALLOW");
  });

  it("does not let an ALLOW rule override a BLOCK verdict", async () => {
    mockEngine({ hate_speech: 0.95 }); // BLOCK on its own
    const res = await runPipeline(
      makeInput("forbidden but severe"),
      makePolicy({
        customRules: [rule({ action: "ALLOW", category: "hate_speech" })],
      }),
    );

    expect(res.action).toBe("BLOCK");
  });

  it("ignores disabled rules and non-matching patterns", async () => {
    mockEngine({});
    const disabled = await runPipeline(
      makeInput("contains forbidden text"),
      makePolicy({
        customRules: [rule({ action: "BLOCK", enabled: false })],
      }),
    );
    expect(disabled.action).toBe("ALLOW");

    mockEngine({});
    const noMatch = await runPipeline(
      makeInput("perfectly clean text"),
      makePolicy({ customRules: [rule({ action: "BLOCK" })] }),
    );
    expect(noMatch.action).toBe("ALLOW");
  });

  it("does not throw on an invalid regex pattern", async () => {
    mockEngine({ harassment: 0.2 });
    const res = await runPipeline(
      makeInput("anything"),
      makePolicy({ customRules: [rule({ pattern: "(", action: "BLOCK" })] }),
    );

    expect(res.action).toBe("ALLOW");
  });
});

// ---- History / trust escalation -------------------------------------------

describe("author-history / trust escalation", () => {
  it("escalates a borderline signal for a low-trust author", async () => {
    // raw 0.8, historyWeight 0.25.
    // Low trust 0.1 -> factor 1.225 -> 0.98 -> BLOCK.
    const policy = makePolicy({ historyWeight: 0.25 });
    const author = (trust: number): ClassificationInput["author"] => ({
      handle: "u",
      trustScore: trust,
      priorViolations: 0,
      accountAgeDays: 1,
    });

    mockEngine({ harassment: 0.8 });
    const untrusted = await runPipeline(
      makeInput("x", author(0.1)),
      policy,
    );
    expect(untrusted.action).toBe("BLOCK");

    // High trust 0.95 -> factor ~1.0125 -> ~0.81 -> stays REVIEW.
    mockEngine({ harassment: 0.8 });
    const trusted = await runPipeline(makeInput("x", author(0.95)), policy);
    expect(trusted.action).toBe("REVIEW");
  });

  it("does not escalate when historyWeight is 0", async () => {
    mockEngine({ harassment: 0.8 });
    const res = await runPipeline(
      makeInput("x", {
        handle: "u",
        trustScore: 0.0,
        priorViolations: 9,
        accountAgeDays: 0,
      }),
      makePolicy({ historyWeight: 0 }),
    );

    // No escalation: adjusted == raw 0.8, below block threshold -> REVIEW.
    expect(res.action).toBe("REVIEW");
    expect(res.overallConfidence).toBeCloseTo(0.8, 5);
  });

  it("uses a default trust of 0.6 when there is no author", async () => {
    // factor = 1 + 0.5 * (1 - 0.6) = 1.2 -> 0.6 * 1.2 = 0.72.
    mockEngine({ harassment: 0.6 });
    const res = await runPipeline(
      makeInput("x"),
      makePolicy({ historyWeight: 0.5 }),
    );

    expect(res.overallConfidence).toBeCloseTo(0.72, 5);
  });
});

// ---- Severity & review priority -------------------------------------------

describe("severity and review priority", () => {
  it("computes severity as adjusted confidence * category base severity", async () => {
    // hate_speech baseSeverity 0.9; adjusted 0.9 -> severity 0.81.
    mockEngine({ hate_speech: 0.9 });
    const res = await runPipeline(makeInput("x"), makePolicy());

    expect(res.severity).toBeCloseTo(0.81, 5);
  });

  it("flags self-harm in the review band as URGENT priority", async () => {
    mockEngine({ self_harm: 0.5 }); // >= review 0.45, < block 0.85 -> REVIEW
    const res = await runPipeline(makeInput("x"), makePolicy());

    expect(res.action).toBe("REVIEW");
    expect(res.priority).toBe("URGENT");
  });
});
