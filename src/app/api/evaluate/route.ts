import { z } from "zod";
import { ok, fail, readJson } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { parsePolicy, enabledCategories } from "@/lib/policy";
import { runPipeline } from "@/lib/pipeline";
import { SAMPLES, type Sample } from "@/lib/samples";
import type { ClassificationInput } from "@/lib/types";

const Body = z.object({ platformId: z.string().min(1) });

function customToSample(row: { id: string; text: string; expected: string; note: string; context: string }): Sample {
  let ctx: { thread?: { author: string; text: string }[]; suggestPlatform?: string; pairId?: string } = {};
  try { ctx = JSON.parse(row.context); } catch {}
  return { id: row.id, text: row.text, expected: row.expected as Sample["expected"], note: row.note, ...ctx };
}

// Batch-evaluate the labelled test set against a platform's policy (dry run,
// nothing persisted). Proves classification accuracy + context handling.
export async function POST(req: Request) {
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return fail("platformId required", 422);

  const platform = await prisma.platform.findUnique({
    where: { id: parsed.data.platformId },
    include: { policy: true },
  });
  if (!platform || !platform.policy) return fail("Platform not found", 404);

  const policy = parsePolicy(platform.policy);
  const enabled = enabledCategories(policy);

  const customs = await prisma.customSample.findMany({ orderBy: { createdAt: "asc" } });
  const allSamples = [...SAMPLES, ...customs.map(customToSample)];

  const results = [];
  for (const sample of allSamples) {
    const input: ClassificationInput = {
      text: sample.text,
      platform: {
        name: platform.name,
        audience: platform.audience,
        enabledCategories: enabled,
      },
      thread: sample.thread,
    };
    const decision = await runPipeline(input, policy);
    const predicted =
      decision.action === "ALLOW"
        ? "benign"
        : decision.topCategory ?? "benign";

    // Credit a correct harmful prediction when the right category is flagged
    // (BLOCK or REVIEW), and a correct benign prediction when allowed.
    const correct =
      sample.expected === "benign"
        ? decision.action === "ALLOW"
        : predicted === sample.expected && decision.action !== "ALLOW";

    results.push({
      id: sample.id,
      text: sample.text,
      expected: sample.expected,
      predicted,
      action: decision.action,
      confidence: decision.overallConfidence,
      engine: decision.engine,
      correct,
      note: sample.note,
      pairId: sample.pairId ?? null,
    });
  }

  const correct = results.filter((r) => r.correct).length;
  return ok({
    platform: { id: platform.id, name: platform.name, audience: platform.audience },
    total: results.length,
    correct,
    accuracy: results.length ? correct / results.length : 0,
    results,
  });
}
