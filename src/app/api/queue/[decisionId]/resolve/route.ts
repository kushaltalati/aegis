import { z } from "zod";
import { ok, fail, readJson } from "@/lib/api";
import { resolveReview } from "@/lib/moderate";

const Body = z.object({
  reviewer: z.string().min(1).default("moderator"),
  finalAction: z.enum(["ALLOW", "BLOCK"]),
  notes: z.string().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ decisionId: string }> },
) {
  const { decisionId } = await params;
  const json = await readJson(req);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return fail("Validation failed", 422, parsed.error.flatten());
  }

  try {
    const result = await resolveReview({ decisionId, ...parsed.data });
    return ok(result);
  } catch (err) {
    console.error("[/api/queue/resolve]", err);
    return fail("Could not resolve review", 500, String(err));
  }
}
