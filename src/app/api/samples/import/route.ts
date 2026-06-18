import { z } from "zod";
import { ok, fail } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { isHarmCategory } from "@/lib/categories";

const RowSchema = z.object({
  text: z.string().min(1),
  expected: z.string().min(1),
  note: z.string().default(""),
  suggestPlatform: z.string().optional(),
  pairId: z.string().optional(),
});

function parseCsv(csv: string): unknown[] {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
    const values: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === "," && !inQ) {
        values.push(cur); cur = "";
      } else cur += ch;
    }
    values.push(cur);
    return Object.fromEntries(headers.map((h, i) => [h, (values[i] ?? "").trim()]));
  });
}

export async function POST(req: Request) {
  const contentType = req.headers.get("content-type") ?? "";

  let rows: unknown[];
  if (contentType.includes("text/csv") || contentType.includes("text/plain")) {
    rows = parseCsv(await req.text());
  } else {
    let body: unknown;
    try { body = await req.json(); } catch { return fail("Invalid body", 400); }
    rows = Array.isArray(body) ? body : ((body as { samples?: unknown[] }).samples ?? []);
  }

  const valid: { text: string; expected: string; note: string; context: string }[] = [];
  const errors: { row: number; error: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const parsed = RowSchema.safeParse(rows[i]);
    if (!parsed.success) {
      errors.push({ row: i + 1, error: parsed.error.message });
      continue;
    }
    const { text, expected, note, suggestPlatform, pairId } = parsed.data;
    if (expected !== "benign" && !isHarmCategory(expected)) {
      errors.push({ row: i + 1, error: `Unknown expected: ${expected}` });
      continue;
    }
    valid.push({ text, expected, note, context: JSON.stringify({ suggestPlatform, pairId }) });
  }

  if (!valid.length) return fail("No valid rows found", 422, { errors });

  const result = await prisma.customSample.createMany({ data: valid });
  return ok({ inserted: result.count, errors });
}
