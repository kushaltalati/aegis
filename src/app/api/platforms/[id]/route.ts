import { ok, fail } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { parsePolicy } from "@/lib/policy";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const platform = await prisma.platform.findUnique({
    where: { id },
    include: { policy: true },
  });
  if (!platform || !platform.policy) return fail("Platform not found", 404);

  return ok({
    platform: {
      id: platform.id,
      slug: platform.slug,
      name: platform.name,
      description: platform.description,
      audience: platform.audience,
      accentColor: platform.accentColor,
    },
    policy: parsePolicy(platform.policy),
  });
}
