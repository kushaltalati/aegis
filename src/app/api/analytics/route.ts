import { ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { HARM_CATEGORIES } from "@/lib/categories";
import { geminiAvailable, groqAvailable } from "@/lib/engine";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

type Bucket = "day" | "hour";

/** Floor a date to the start of its UTC day or hour. */
function bucketStart(date: Date, unit: Bucket): number {
  const d = new Date(date);
  d.setUTCMilliseconds(0);
  d.setUTCSeconds(0);
  d.setUTCMinutes(0);
  if (unit === "day") d.setUTCHours(0);
  return d.getTime();
}

/** Human label for a bucket boundary (UTC). */
function bucketLabel(t: number, unit: Bucket): string {
  const d = new Date(t);
  if (unit === "day") return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
  return `${String(d.getUTCHours()).padStart(2, "0")}:00`;
}

/**
 * Group real Decision rows into a continuous time series, one count per outcome
 * per bucket. Buckets by day; if every decision falls on a single calendar day,
 * falls back to hourly buckets so a single demo session still shows a trend.
 * Gaps between the first and last bucket are filled with zero rows.
 */
function buildTimeSeries(rows: { createdAt: Date; action: string }[]) {
  if (rows.length === 0) {
    return { bucket: "day" as Bucket, points: [] as TimeSeriesPoint[] };
  }

  const distinctDays = new Set(
    rows.map((r) => bucketStart(r.createdAt, "day")),
  );
  const unit: Bucket = distinctDays.size <= 1 ? "hour" : "day";
  const step = unit === "day" ? DAY_MS : HOUR_MS;

  const counts = new Map<number, { ALLOW: number; REVIEW: number; BLOCK: number }>();
  let min = Infinity;
  let max = -Infinity;
  for (const r of rows) {
    const key = bucketStart(r.createdAt, unit);
    min = Math.min(min, key);
    max = Math.max(max, key);
    let entry = counts.get(key);
    if (!entry) {
      entry = { ALLOW: 0, REVIEW: 0, BLOCK: 0 };
      counts.set(key, entry);
    }
    if (r.action === "ALLOW" || r.action === "REVIEW" || r.action === "BLOCK") {
      entry[r.action] += 1;
    }
  }

  const points: TimeSeriesPoint[] = [];
  for (let t = min; t <= max; t += step) {
    const entry = counts.get(t) ?? { ALLOW: 0, REVIEW: 0, BLOCK: 0 };
    points.push({
      t: new Date(t).toISOString(),
      label: bucketLabel(t, unit),
      ALLOW: entry.ALLOW,
      REVIEW: entry.REVIEW,
      BLOCK: entry.BLOCK,
    });
  }

  return { bucket: unit, points };
}

type TimeSeriesPoint = {
  t: string;
  label: string;
  ALLOW: number;
  REVIEW: number;
  BLOCK: number;
};

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
    seriesRows,
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
    prisma.moderationDecision.findMany({
      where,
      select: { createdAt: true, action: true },
      orderBy: { createdAt: "asc" },
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

  const timeSeries = buildTimeSeries(seriesRows);

  return ok({
    total,
    actionCounts,
    timeSeries,
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
    groqAvailable: groqAvailable(),
  });
}
