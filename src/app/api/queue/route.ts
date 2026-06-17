import { ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { decisionInclude, serializeDecision } from "@/lib/serialize";

const PRIORITY_ORDER: Record<string, number> = {
  URGENT: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? "PENDING";
  const platformId = url.searchParams.get("platformId");

  const items = await prisma.reviewQueueItem.findMany({
    where: {
      status: status === "ALL" ? undefined : status,
      decision: platformId ? { platformId } : undefined,
    },
    include: { decision: { include: decisionInclude } },
    orderBy: { createdAt: "desc" },
  });

  const data = items
    .map((it) => ({
      queueId: it.id,
      priority: it.priority,
      queueStatus: it.status,
      assignedTo: it.assignedTo,
      enqueuedAt: it.createdAt.toISOString(),
      decision: serializeDecision(it.decision),
    }))
    .sort(
      (a, b) =>
        (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9),
    );

  return ok({ queue: data });
}
