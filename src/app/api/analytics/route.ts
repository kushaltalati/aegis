import { ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { HARM_CATEGORIES } from "@/lib/categories";
import { geminiAvailable } from "@/lib/engine";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const platformId = url.searchParams.get("platformId") || undefined;
  const where = platformId ? { platformId } : {};

  const [
    total,
    byAction,
    byEngine,
    byCategory,
    pendingQueue,
    feedback,
    agg,
    byPlatform,
    recent,
  ] = await Promise.all([
    prisma.moderationDecision.count({ where }),
    prisma.moderationDecision.groupBy({
      by: ["action"],
      where,
      _count: { _all: true },
    }),
    prisma.moderationDecision.groupBy({
      by: ["engine"],
      where,
      _count: { _all: true },
    }),
    prisma.moderationDecision.groupBy({
      by: ["topCategory"],
      where: { ...where, action: { in: ["BLOCK", "REVIEW"] } },
      _count: { _all: true },
    }),
    prisma.reviewQueueItem.count({
      where: { status: "PENDING", decision: where },
    }),
    prisma.reviewerFeedback.findMany({
      where: { decision: where },
      select: { agreesWithAI: true },
    }),
    prisma.moderationDecision.aggregate({
      where,
      _avg: { latencyMs: true, overallConfidence: true, severity: true },
    }),
    prisma.platform.findMany({
      include: { _count: { select: { decisions: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.moderationDecision.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { contentItem: true, platform: true },
    }),
  ]);

  const actionCounts = { ALLOW: 0, BLOCK: 0, REVIEW: 0 } as Record<
    string,
    number
  >;
  for (const a of byAction) actionCounts[a.action] = a._count._all;

  const engineCounts: Record<string, number> = {};
  for (const e of byEngine) engineCounts[e.engine] = e._count._all;

  const categoryCounts: Record<string, number> = {};
  for (const c of HARM_CATEGORIES) categoryCounts[c] = 0;
  for (const c of byCategory) {
    if (c.topCategory) categoryCounts[c.topCategory] = c._count._all;
  }

  const reviewed = feedback.length;
  const agreed = feedback.filter((f) => f.agreesWithAI).length;

  return ok({
    total,
    actionCounts,
    engineCounts,
    categoryCounts,
    pendingQueue,
    agreement: {
      reviewed,
      agreed,
      rate: reviewed ? agreed / reviewed : null,
    },
    averages: {
      latencyMs: agg._avg.latencyMs ?? 0,
      confidence: agg._avg.overallConfidence ?? 0,
      severity: agg._avg.severity ?? 0,
    },
    byPlatform: byPlatform.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      accentColor: p.accentColor,
      audience: p.audience,
      count: p._count.decisions,
    })),
    recent: recent.map((r) => ({
      id: r.id,
      action: r.action,
      topCategory: r.topCategory,
      confidence: r.overallConfidence,
      text: r.contentItem.text,
      platform: r.platform.name,
      accentColor: r.platform.accentColor,
      createdAt: r.createdAt.toISOString(),
    })),
    geminiAvailable: geminiAvailable(),
  });
}
