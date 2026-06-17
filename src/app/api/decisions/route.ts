import { ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { decisionInclude, serializeDecision } from "@/lib/serialize";
import { Prisma } from "@prisma/client";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const platformId = url.searchParams.get("platformId");
  const action = url.searchParams.get("action"); // ALLOW | BLOCK | REVIEW
  const category = url.searchParams.get("category");
  const q = url.searchParams.get("q");
  const take = Math.min(Number(url.searchParams.get("take") ?? 100), 300);

  const where: Prisma.ModerationDecisionWhereInput = {
    platformId: platformId ?? undefined,
    action: action ?? undefined,
    topCategory: category ?? undefined,
    contentItem: q
      ? { text: { contains: q } }
      : undefined,
  };

  const decisions = await prisma.moderationDecision.findMany({
    where,
    include: decisionInclude,
    orderBy: { createdAt: "desc" },
    take,
  });

  return ok({ decisions: decisions.map(serializeDecision) });
}
