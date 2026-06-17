import { ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const entityId = url.searchParams.get("entityId") || undefined;
  const take = Math.min(Number(url.searchParams.get("take") ?? 100), 300);

  const logs = await prisma.auditLog.findMany({
    where: { entityId },
    orderBy: { createdAt: "desc" },
    take,
  });

  return ok({
    logs: logs.map((l) => ({
      id: l.id,
      entityType: l.entityType,
      entityId: l.entityId,
      action: l.action,
      actor: l.actor,
      details: (() => {
        try {
          return JSON.parse(l.details);
        } catch {
          return {};
        }
      })(),
      createdAt: l.createdAt.toISOString(),
    })),
  });
}
