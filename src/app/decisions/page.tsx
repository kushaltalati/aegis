"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import {
  ScrollText,
  Search,
  X,
  History,
  Bot,
  UserCheck,
  Settings2,
} from "lucide-react";
import {
  Card,
  SectionTitle,
  Select,
  Input,
  Spinner,
  EmptyState,
  Badge,
} from "@/components/ui";
import {
  DecisionDetail,
  ActionBadge,
  CategoryChip,
  categoryLabel,
} from "@/components/moderation";
import {
  api,
  type PlatformSummary,
  type SerializedDecision,
} from "@/lib/client";
import { HARM_CATEGORIES } from "@/lib/categories";
import { pct, timeAgo, cn } from "@/lib/utils";

export default function DecisionsPage() {
  return (
    <React.Suspense fallback={null}>
      <DecisionsInner />
    </React.Suspense>
  );
}

function DecisionsInner() {
  const params = useSearchParams();
  const focus = params.get("focus");

  const [platforms, setPlatforms] = React.useState<PlatformSummary[]>([]);
  const [decisions, setDecisions] = React.useState<SerializedDecision[]>([]);
  const [loading, setLoading] = React.useState(true);

  const [platformId, setPlatformId] = React.useState("");
  const [action, setAction] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [q, setQ] = React.useState("");

  const [openId, setOpenId] = React.useState<string | null>(null);

  React.useEffect(() => {
    api<{ platforms: PlatformSummary[] }>("/api/platforms").then((d) =>
      setPlatforms(d.platforms),
    );
  }, []);

  React.useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true);
      const qs = new URLSearchParams();
      if (platformId) qs.set("platformId", platformId);
      if (action) qs.set("action", action);
      if (category) qs.set("category", category);
      if (q) qs.set("q", q);
      api<{ decisions: SerializedDecision[] }>(`/api/decisions?${qs}`)
        .then((d) => setDecisions(d.decisions))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [platformId, action, category, q]);

  React.useEffect(() => {
    if (focus) setOpenId(focus);
  }, [focus]);

  const open = decisions.find((d) => d.id === openId) ?? null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <ScrollText className="h-5 w-5 text-primary" />
          Decision Log
        </h1>
        <p className="mt-1 text-sm text-muted">
          Every decision is auditable — the offending segment, category,
          reasoning, and routing trace.
        </p>
      </div>

      {/* Filters */}
      <Card className="flex flex-wrap items-center gap-3 p-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <Input
            className="pl-9"
            placeholder="Search content…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Select
          className="w-auto"
          value={platformId}
          onChange={(e) => setPlatformId(e.target.value)}
        >
          <option value="">All platforms</option>
          {platforms.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Select
          className="w-auto"
          value={action}
          onChange={(e) => setAction(e.target.value)}
        >
          <option value="">All actions</option>
          <option value="ALLOW">Allowed</option>
          <option value="REVIEW">Review</option>
          <option value="BLOCK">Blocked</option>
        </Select>
        <Select
          className="w-auto"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">All categories</option>
          {HARM_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {categoryLabel(c)}
            </option>
          ))}
        </Select>
      </Card>

      {/* List */}
      {loading && decisions.length === 0 ? (
        <div className="flex items-center justify-center py-20 text-muted">
          <Spinner className="h-6 w-6" />
        </div>
      ) : decisions.length === 0 ? (
        <EmptyState
          icon={<ScrollText />}
          title="No decisions match"
          description="Try clearing the filters or run more content through the console."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="hidden grid-cols-[88px_1fr_160px_90px_120px] gap-3 border-b border-border px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-faint md:grid">
            <span>Action</span>
            <span>Content</span>
            <span>Category</span>
            <span className="text-right">Confidence</span>
            <span className="text-right">When</span>
          </div>
          <div className="divide-y divide-border">
            {decisions.map((d) => (
              <button
                key={d.id}
                onClick={() => setOpenId(d.id)}
                className="grid w-full grid-cols-1 items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-elevated/50 md:grid-cols-[88px_1fr_160px_90px_120px] md:gap-3"
              >
                <ActionBadge action={d.action} size="sm" />
                <span className="truncate text-sm text-foreground">
                  {d.content.text}
                </span>
                <span className="hidden md:block">
                  {d.topCategory ? (
                    <CategoryChip category={d.topCategory} />
                  ) : (
                    <span className="text-xs text-faint">—</span>
                  )}
                </span>
                <span className="tabular hidden text-right text-sm text-muted md:block">
                  {d.overallConfidence > 0 ? pct(d.overallConfidence) : "—"}
                </span>
                <span className="hidden text-right text-xs text-faint md:block">
                  {timeAgo(d.createdAt)}
                </span>
              </button>
            ))}
          </div>
        </Card>
      )}

      {open && <DetailModal decision={open} onClose={() => setOpenId(null)} />}
    </div>
  );
}

type AuditEntry = {
  id: string;
  entityType: string;
  action: string;
  actor: string;
  details: Record<string, unknown>;
  createdAt: string;
};

function DetailModal({
  decision,
  onClose,
}: {
  decision: SerializedDecision;
  onClose: () => void;
}) {
  const [audit, setAudit] = React.useState<AuditEntry[]>([]);

  React.useEffect(() => {
    api<{ logs: AuditEntry[] }>(`/api/audit?entityId=${decision.id}`)
      .then((d) => setAudit(d.logs))
      .catch(() => setAudit([]));
  }, [decision.id]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="animate-fade-up relative h-full w-full max-w-3xl overflow-y-auto border-l border-border bg-background p-5 shadow-2xl sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <SectionTitle
            title="Decision detail"
            subtitle={decision.id}
            icon={<ScrollText />}
          />
          <button
            aria-label="Close"
            onClick={onClose}
            className="rounded-lg border border-border bg-elevated p-2 text-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <DecisionDetail decision={decision} />

        {/* Audit trail */}
        <Card className="mt-4 p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-faint">
            <History className="h-3.5 w-3.5" /> Audit trail
          </div>
          {audit.length === 0 ? (
            <p className="text-sm text-faint">No audit entries.</p>
          ) : (
            <ol className="space-y-3">
              {audit.map((a) => {
                const isHuman = a.actor.startsWith("reviewer");
                const isPolicy = a.entityType === "policy" || a.action.startsWith("policy");
                const Icon = isHuman ? UserCheck : isPolicy ? Settings2 : Bot;
                return (
                  <li key={a.id} className="flex gap-3">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-elevated">
                      <Icon className="h-3.5 w-3.5 text-muted" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge className="border-border text-foreground">
                          {a.action}
                        </Badge>
                        <span className="font-mono text-xs text-faint">
                          {a.actor}
                        </span>
                        <span className="text-xs text-faint">
                          {timeAgo(a.createdAt)}
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>
      </div>
    </div>
  );
}
