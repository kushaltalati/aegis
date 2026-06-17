import { ok } from "@/lib/api";
import { SAMPLES } from "@/lib/samples";

export async function GET() {
  return ok({ samples: SAMPLES });
}
