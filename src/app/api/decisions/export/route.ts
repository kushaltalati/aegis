import { prisma } from "@/lib/prisma";
import { decisionInclude, serializeDecision } from "@/lib/serialize";
import { Prisma } from "@prisma/client";

function esc(v: string | number | boolean | null | undefined): string {
  const s = String(v ?? "");
  return s.includes(",") || s.includes('"') || s.includes("\n")
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

const HEADERS = [
  "id", "action", "status", "engine", "topCategory",
  "overallConfidence", "severity", "latencyMs",
  "contentText", "platformName", "platformAudience", "authorHandle",
  "createdAt", "reasoning",
  "reviewStatus", "reviewPriority",
  "reviewer", "finalAction", "agreesWithAI", "reviewNotes",
];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const platformId = url.searchParams.get("platformId");
  const action = url.searchParams.get("action");
  const category = url.searchParams.get("category");
  const q = url.searchParams.get("q");
  const take = Math.min(Number(url.searchParams.get("take") ?? 5000), 5000);

  const where: Prisma.ModerationDecisionWhereInput = {
    platformId: platformId ?? undefined,
    action: action ?? undefined,
    topCategory: category ?? undefined,
    contentItem: q ? { text: { contains: q } } : undefined,
  };

  const decisions = await prisma.moderationDecision.findMany({
    where,
    include: decisionInclude,
    orderBy: { createdAt: "desc" },
    take,
  });

  const rows = decisions.map(serializeDecision).map((d) =>
    [
      d.id, d.action, d.status, d.engine, d.topCategory ?? "",
      d.overallConfidence.toFixed(4), d.severity.toFixed(4), d.latencyMs,
      d.content.text, d.platform.name, d.platform.audience,
      d.content.author?.handle ?? "",
      d.createdAt, d.reasoning,
      d.reviewItem?.status ?? "", d.reviewItem?.priority ?? "",
      d.feedback?.reviewer ?? "", d.feedback?.finalAction ?? "",
      d.feedback != null ? d.feedback.agreesWithAI : "",
      d.feedback?.notes ?? "",
    ]
      .map(esc)
      .join(","),
  );

  const date = new Date().toISOString().slice(0, 10);
  const csv = [HEADERS.join(","), ...rows].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="aegis-decisions-${date}.csv"`,
    },
  });
}
