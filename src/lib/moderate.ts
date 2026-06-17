// Orchestration: load a platform's policy, run the pipeline, and persist the
// decision, per-category scores, review-queue entry, and audit log atomically.

import { prisma } from "./prisma";
import { parsePolicy, enabledCategories } from "./policy";
import { runPipeline } from "./pipeline";
import type {
  ClassificationInput,
  ModerationAction,
  ThreadMessage,
} from "./types";

export type ModerateRequest = {
  platformId: string;
  text: string;
  authorId?: string | null;
  threadId?: string | null;
  thread?: ThreadMessage[];
  note?: string;
  /** Mark the created content item with a ground-truth label (test set). */
  label?: string | null;
};

export class PlatformNotFoundError extends Error {}

export async function moderateContent(req: ModerateRequest) {
  const platform = await prisma.platform.findUnique({
    where: { id: req.platformId },
    include: { policy: true },
  });
  if (!platform || !platform.policy) {
    throw new PlatformNotFoundError(`Platform ${req.platformId} not found`);
  }

  const policy = parsePolicy(platform.policy);

  const author = req.authorId
    ? await prisma.authorProfile.findUnique({ where: { id: req.authorId } })
    : null;

  const input: ClassificationInput = {
    text: req.text,
    platform: {
      name: platform.name,
      audience: platform.audience,
      enabledCategories: enabledCategories(policy),
    },
    author: author
      ? {
          handle: author.handle,
          trustScore: author.trustScore,
          priorViolations: author.priorViolations,
          accountAgeDays: author.accountAgeDays,
        }
      : null,
    thread: req.thread,
    note: req.note,
  };

  const decision = await runPipeline(input, policy);

  // Persist everything in one transaction.
  const saved = await prisma.$transaction(async (tx) => {
    const item = await tx.contentItem.create({
      data: {
        platformId: platform.id,
        authorId: author?.id ?? null,
        threadId: req.threadId ?? null,
        text: req.text,
        context: req.thread?.length || req.note
          ? JSON.stringify({ thread: req.thread ?? [], note: req.note ?? "" })
          : null,
        label: req.label ?? null,
      },
    });

    const dec = await tx.moderationDecision.create({
      data: {
        contentItemId: item.id,
        platformId: platform.id,
        action: decision.action,
        status: decision.status,
        engine: decision.engine,
        topCategory: decision.topCategory,
        overallConfidence: decision.overallConfidence,
        severity: decision.severity,
        reasoning: decision.reasoning,
        segments: JSON.stringify(decision.segments),
        rawModel: JSON.stringify({
          raw: decision.raw,
          routingTrace: decision.routingTrace,
        }),
        latencyMs: decision.latencyMs,
        scores: {
          create: decision.scores.map((s) => ({
            category: s.category,
            confidence: s.confidence,
            severity: s.severity,
            enabled: s.enabled,
            triggeredRule: s.triggeredRule ?? null,
          })),
        },
      },
    });

    if (decision.action === "REVIEW") {
      await tx.reviewQueueItem.create({
        data: {
          decisionId: dec.id,
          status: "PENDING",
          priority: decision.priority,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        entityType: "decision",
        entityId: dec.id,
        action: `auto:${decision.action}`,
        actor: `ai:${decision.engine}`,
        details: JSON.stringify({
          topCategory: decision.topCategory,
          overallConfidence: decision.overallConfidence,
          routingTrace: decision.routingTrace,
        }),
      },
    });

    return { item, dec };
  });

  return { decision, saved, platform, policy };
}

/** A human moderator's final call on a queued decision. */
export async function resolveReview(params: {
  decisionId: string;
  reviewer: string;
  finalAction: Extract<ModerationAction, "ALLOW" | "BLOCK">;
  notes?: string;
}) {
  const decision = await prisma.moderationDecision.findUnique({
    where: { id: params.decisionId },
    include: { reviewItem: true },
  });
  if (!decision) throw new Error("Decision not found");

  // AI "agrees" if its leaning (REVIEW with a top category) matches the human's
  // block/allow direction. A blocked outcome agrees with an AI that flagged it.
  const aiLeanedHarmful =
    decision.action === "BLOCK" ||
    (decision.action === "REVIEW" && (decision.overallConfidence ?? 0) >= 0.5);
  const agreesWithAI =
    (params.finalAction === "BLOCK") === aiLeanedHarmful;

  return prisma.$transaction(async (tx) => {
    await tx.reviewerFeedback.upsert({
      where: { decisionId: decision.id },
      create: {
        decisionId: decision.id,
        reviewer: params.reviewer,
        finalAction: params.finalAction,
        agreesWithAI,
        notes: params.notes ?? null,
      },
      update: {
        reviewer: params.reviewer,
        finalAction: params.finalAction,
        agreesWithAI,
        notes: params.notes ?? null,
      },
    });

    await tx.moderationDecision.update({
      where: { id: decision.id },
      data: { status: "RESOLVED" },
    });

    if (decision.reviewItem) {
      await tx.reviewQueueItem.update({
        where: { id: decision.reviewItem.id },
        data: { status: "RESOLVED", assignedTo: params.reviewer },
      });
    }

    await tx.auditLog.create({
      data: {
        entityType: "review",
        entityId: decision.id,
        action: `human:${params.finalAction}`,
        actor: `reviewer:${params.reviewer}`,
        details: JSON.stringify({
          agreesWithAI,
          notes: params.notes ?? "",
          aiAction: decision.action,
        }),
      },
    });

    return { agreesWithAI };
  });
}
