import { ok, fail } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    await prisma.customSample.delete({ where: { id } });
    return ok({ deleted: true });
  } catch {
    return fail("Sample not found", 404);
  }
}
