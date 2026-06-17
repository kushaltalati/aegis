import { NextResponse } from "next/server";

export function ok<T>(data: T, init?: number) {
  return NextResponse.json(data, { status: init ?? 200 });
}

export function fail(message: string, status = 400, extra?: unknown) {
  return NextResponse.json({ error: message, detail: extra }, { status });
}

/** Parse + validate JSON body; throws a Response on failure. */
export async function readJson<T = unknown>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw fail("Invalid JSON body", 400);
  }
}
