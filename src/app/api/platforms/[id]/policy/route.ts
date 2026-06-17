import { z } from "zod";
import { ok, fail, readJson } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { HARM_CATEGORIES } from "@/lib/categories";
import { parsePolicy, serializePolicyForDb } from "@/lib/policy";
import type { PolicySnapshot } from "@/lib/types";

const CategoryPolicy = z.object({
  enabled: z.boolean(),
  weight: z.number().min(0).max(3),
  blockThreshold: z.number().min(0).max(1).optional(),
  reviewThreshold: z.number().min(0).max(1).optional(),
});

const CustomRule = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string(),
  pattern: z.string().min(1),
  category: z.enum(HARM_CATEGORIES),
  action: z.enum(["ALLOW", "REVIEW", "BLOCK"]),
  enabled: z.boolean(),
});

const Body = z.object({
  engine: z.enum(["auto", "gemini", "local"]),
  autoBlockThreshold: z.number().min(0).max(1),
  reviewThreshold: z.number().min(0).max(1),
  historyWeight: z.number().min(0).max(1),
  categoryConfig: z.record(z.enum(HARM_CATEGORIES), CategoryPolicy),
  customRules: z.array(CustomRule),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const json = await readJson(req);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return fail("Validation failed", 422, parsed.error.flatten());
  }

  const platform = await prisma.platform.findUnique({
    where: { id },
    include: { policy: true },
  });
  if (!platform || !platform.policy) return fail("Platform not found", 404);

  // reviewThreshold must not exceed the block threshold.
  if (parsed.data.reviewThreshold > parsed.data.autoBlockThreshold) {
    return fail("Review threshold cannot exceed the auto-block threshold", 422);
  }

  const snapshot = parsed.data as unknown as PolicySnapshot;
  const updated = await prisma.policyConfig.update({
    where: { platformId: id },
    data: serializePolicyForDb(snapshot),
  });

  await prisma.auditLog.create({
    data: {
      entityType: "policy",
      entityId: platform.id,
      action: "policy:update",
      actor: "reviewer:console",
      details: JSON.stringify({
        engine: snapshot.engine,
        autoBlockThreshold: snapshot.autoBlockThreshold,
        reviewThreshold: snapshot.reviewThreshold,
      }),
    },
  });

  return ok({ policy: parsePolicy(updated) });
}
