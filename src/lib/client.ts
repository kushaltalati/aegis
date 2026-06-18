"use client";

import type { SerializedDecision } from "./serialize";

// Thin fetch wrapper for client components.
export async function api<T>(
  path: string,
  init?: RequestInit & { json?: unknown },
): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(path, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(rest.headers ?? {}),
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (data as { error?: string })?.error ?? `Request failed (${res.status})`,
    );
  }
  return data as T;
}

export type { SerializedDecision };

// ---- Shared API response shapes (client-side) ----

export type PlatformSummary = {
  id: string;
  slug: string;
  name: string;
  description: string;
  audience: string;
  accentColor: string;
  decisionCount: number;
  policy: {
    engine: string;
    autoBlockThreshold: number;
    reviewThreshold: number;
    historyWeight: number;
    enabledCategories: string[];
    customRuleCount: number;
  } | null;
};

export type QueueEntry = {
  queueId: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  queueStatus: string;
  assignedTo: string | null;
  enqueuedAt: string;
  decision: SerializedDecision;
};

export type Analytics = {
  total: number;
  actionCounts: Record<string, number>;
  engineCounts: Record<string, number>;
  categoryCounts: Record<string, number>;
  pendingQueue: number;
  agreement: { reviewed: number; agreed: number; rate: number | null };
  averages: { latencyMs: number; confidence: number; severity: number };
  byPlatform: {
    id: string;
    name: string;
    slug: string;
    accentColor: string;
    audience: string;
    count: number;
  }[];
  recent: {
    id: string;
    action: string;
    topCategory: string | null;
    confidence: number;
    text: string;
    platform: string;
    accentColor: string;
    createdAt: string;
  }[];
  geminiAvailable: boolean;
  groqAvailable: boolean;
};

export type AuthorSummary = {
  id: string;
  handle: string;
  displayName: string;
  trustScore: number;
  priorViolations: number;
  accountAgeDays: number;
};

export type EvalResult = {
  platform: { id: string; name: string; audience: string };
  total: number;
  correct: number;
  accuracy: number;
  results: {
    id: string;
    text: string;
    expected: string;
    predicted: string;
    action: string;
    confidence: number;
    engine: string;
    correct: boolean;
    note: string;
    pairId: string | null;
  }[];
};
