import { z } from "zod";
import { ok, fail, readJson } from "@/lib/api";
import {
  moderateContent,
  PlatformNotFoundError,
  type ModerateRequest,
} from "@/lib/moderate";
import { prisma } from "@/lib/prisma";
import { decisionInclude, serializeDecision } from "@/lib/serialize";

const Body = z.object({
  platformId: z.string().min(1),
  text: z.string().min(1, "Content text is required").max(5000),
  authorId: z.string().nullish(),
  threadId: z.string().nullish(),
  thread: z
    .array(z.object({ author: z.string(), text: z.string() }))
    .optional(),
  note: z.string().optional(),
  label: z.string().nullish(),
});

export async function POST(req: Request) {
  const json = await readJson(req);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return fail("Validation failed", 422, parsed.error.flatten());
  }

  try {
    const { saved } = await moderateContent(parsed.data as ModerateRequest);
    const full = await prisma.moderationDecision.findUniqueOrThrow({
      where: { id: saved.dec.id },
      include: decisionInclude,
    });
    return ok({ decision: serializeDecision(full) }, 201);
  } catch (err) {
    if (err instanceof PlatformNotFoundError) return fail(err.message, 404);
    console.error("[/api/moderate]", err);
    return fail("Moderation failed", 500, String(err));
  }
}
