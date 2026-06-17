import { ok, fail } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { decisionInclude, serializeDecision } from "@/lib/serialize";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const decision = await prisma.moderationDecision.findUnique({
    where: { id },
    include: decisionInclude,
  });
  if (!decision) return fail("Decision not found", 404);
  return ok({ decision: serializeDecision(decision) });
}
