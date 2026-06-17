import { ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const authors = await prisma.authorProfile.findMany({
    orderBy: { trustScore: "desc" },
  });
  return ok({
    authors: authors.map((a) => ({
      id: a.id,
      handle: a.handle,
      displayName: a.displayName,
      trustScore: a.trustScore,
      priorViolations: a.priorViolations,
      accountAgeDays: a.accountAgeDays,
    })),
  });
}
