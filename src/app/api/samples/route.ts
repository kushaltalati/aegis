import { z } from "zod";
import { ok, fail, readJson } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { SAMPLES } from "@/lib/samples";
import { isHarmCategory } from "@/lib/categories";

type DbRow = { id: string; text: string; expected: string; note: string; context: string; createdAt: Date };

function fromDb(row: DbRow) {
  let ctx: { thread?: { author: string; text: string }[]; suggestPlatform?: string; pairId?: string } = {};
  try { ctx = JSON.parse(row.context); } catch {}
  return { id: row.id, text: row.text, expected: row.expected, note: row.note, source: "custom" as const, ...ctx };
}

export async function GET() {
  const customs = await prisma.customSample.findMany({ orderBy: { createdAt: "asc" } });
  return ok({
    samples: [
      ...SAMPLES.map((s) => ({ ...s, source: "builtin" as const })),
      ...customs.map(fromDb),
    ],
  });
}

const SampleBody = z.object({
  text: z.string().min(1),
  expected: z.string().min(1),
  note: z.string().default(""),
  suggestPlatform: z.string().optional(),
  pairId: z.string().optional(),
  thread: z.array(z.object({ author: z.string(), text: z.string() })).optional(),
});

export async function POST(req: Request) {
  const body = SampleBody.safeParse(await readJson(req));
  if (!body.success) return fail("Invalid body", 422, body.error.flatten());

  const { text, expected, note, suggestPlatform, pairId, thread } = body.data;
  if (expected !== "benign" && !isHarmCategory(expected))
    return fail(`Unknown expected value: ${expected}`, 422);

  const row = await prisma.customSample.create({
    data: { text, expected, note, context: JSON.stringify({ suggestPlatform, pairId, thread }) },
  });
  return ok({ sample: fromDb(row) }, 201);
}
