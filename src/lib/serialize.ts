// Turns Prisma decision rows (with JSON stored as strings) into client-friendly
// objects. Always include `contentItem` (+author, platform), `scores`,
// `reviewItem`, and `feedback` on the query that feeds this.

import { Prisma } from "@prisma/client";
import type { OffendingSegment } from "./types";

export const decisionInclude = {
  contentItem: { include: { author: true } },
  platform: true,
  scores: true,
  reviewItem: true,
  feedback: true,
} satisfies Prisma.ModerationDecisionInclude;

type FullDecision = Prisma.ModerationDecisionGetPayload<{
  include: typeof decisionInclude;
}>;

function safeParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function serializeDecision(d: FullDecision) {
  const raw = safeParse<{ raw?: unknown; routingTrace?: string[] }>(
    d.rawModel,
    {},
  );
  const context = safeParse<{ thread?: unknown[]; note?: string }>(
    d.contentItem.context,
    { thread: [], note: "" },
  );

  return {
    id: d.id,
    action: d.action,
    status: d.status,
    engine: d.engine,
    topCategory: d.topCategory,
    overallConfidence: d.overallConfidence,
    severity: d.severity,
    reasoning: d.reasoning,
    latencyMs: d.latencyMs,
    createdAt: d.createdAt.toISOString(),
    segments: safeParse<OffendingSegment[]>(d.segments, []),
    routingTrace: raw.routingTrace ?? [],
    scores: d.scores
      .map((s) => ({
        category: s.category,
        confidence: s.confidence,
        severity: s.severity,
        enabled: s.enabled,
        triggeredRule: s.triggeredRule,
      }))
      .sort((a, b) => b.confidence - a.confidence),
    content: {
      id: d.contentItem.id,
      text: d.contentItem.text,
      label: d.contentItem.label,
      threadId: d.contentItem.threadId,
      context,
      author: d.contentItem.author
        ? {
            id: d.contentItem.author.id,
            handle: d.contentItem.author.handle,
            displayName: d.contentItem.author.displayName,
            trustScore: d.contentItem.author.trustScore,
            priorViolations: d.contentItem.author.priorViolations,
            accountAgeDays: d.contentItem.author.accountAgeDays,
          }
        : null,
    },
    platform: {
      id: d.platform.id,
      name: d.platform.name,
      slug: d.platform.slug,
      audience: d.platform.audience,
      accentColor: d.platform.accentColor,
    },
    reviewItem: d.reviewItem
      ? {
          status: d.reviewItem.status,
          priority: d.reviewItem.priority,
          assignedTo: d.reviewItem.assignedTo,
        }
      : null,
    feedback: d.feedback
      ? {
          reviewer: d.feedback.reviewer,
          finalAction: d.feedback.finalAction,
          agreesWithAI: d.feedback.agreesWithAI,
          notes: d.feedback.notes,
          createdAt: d.feedback.createdAt.toISOString(),
        }
      : null,
  };
}

export type SerializedDecision = ReturnType<typeof serializeDecision>;
