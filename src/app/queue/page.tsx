"use client";

import * as React from "react";
import {
  Inbox,
  Check,
  ShieldX,
  ShieldCheck,
  UserCheck,
  Clock,
} from "lucide-react";
import {
  Card,
  SectionTitle,
  Button,
  Input,
  Textarea,
  Spinner,
  EmptyState,
  Badge,
} from "@/components/ui";
import {
  DecisionDetail,
  ActionBadge,
  PriorityBadge,
  CategoryChip,
} from "@/components/moderation";
import { api, type QueueEntry } from "@/lib/client";
import { pct, timeAgo, cn } from "@/lib/utils";

type StatusFilter = "PENDING" | "RESOLVED" | "ALL";

export default function QueuePage() {
  const [status, setStatus] = React.useState<StatusFilter>("PENDING");
  const [queue, setQueue] = React.useState<QueueEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    setLoading(true);
    api<{ queue: QueueEntry[] }>(`/api/queue?status=${status}`)
      .then((d) => {
        setQueue(d.queue);
        setSelectedId((cur) =>
          cur && d.queue.some((q) => q.decision.id === cur)
            ? cur
            : (d.queue[0]?.decision.id ?? null),
        );
      })
      .finally(() => setLoading(false));
  }, [status]);

  React.useEffect(() => {
    load();
  }, [load]);

  const selected = queue.find((q) => q.decision.id === selectedId) ?? null;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <Inbox className="h-5 w-5 text-primary" />
            Human Review Queue
          </h1>
          <p className="mt-1 text-sm text-muted">
            Ambiguous cases the AI routed to humans. Your call feeds back as
            training signal.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-border bg-surface p-1">
          {(["PENDING", "RESOLVED", "ALL"] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium uppercase tracking-wide transition-colors",
                status === s
                  ? "bg-primary/15 text-foreground"
                  : "text-muted hover:text-foreground",
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {loading && queue.length === 0 ? (
        <div className="flex items-center justify-center py-20 text-muted">
          <Spinner className="h-6 w-6" />
        </div>
      ) : queue.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck />}
          title={status === "PENDING" ? "Queue is clear" : "Nothing here"}
          description={
            status === "PENDING"
              ? "No content is currently awaiting human review."
              : "No items match this filter."
          }
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
          {/* List */}
          <div className="space-y-2">
            {queue.map((q) => {
              const d = q.decision;
              const active = d.id === selectedId;
              return (
                <button
                  key={q.queueId}
                  onClick={() => setSelectedId(d.id)}
                  className={cn(
                    "w-full rounded-xl border p-3 text-left transition-all",
                    active
                      ? "border-primary bg-primary/8"
                      : "border-border bg-card hover:border-border-strong",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <PriorityBadge priority={q.priority} />
                    <span className="text-xs text-faint">
                      {timeAgo(q.enqueuedAt)}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-foreground">
                    {d.content.text}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {d.topCategory && (
                      <CategoryChip
                        category={d.topCategory}
                        confidence={d.overallConfidence}
                      />
                    )}
                    <span
                      className="ml-auto flex items-center gap-1 text-xs text-faint"
                      title={d.platform.name}
                    >
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: d.platform.accentColor }}
                      />
                      {d.platform.name}
                    </span>
                  </div>
                  {q.queueStatus === "RESOLVED" && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-success">
                      <UserCheck className="h-3.5 w-3.5" />
                      Resolved{q.assignedTo ? ` by ${q.assignedTo}` : ""}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Detail + reviewer panel */}
          <div className="space-y-4">
            {selected ? (
              <>
                <ReviewerPanel
                  entry={selected}
                  onResolved={() => load()}
                />
                <DecisionDetail decision={selected.decision} />
              </>
            ) : (
              <EmptyState title="Select an item to review" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ReviewerPanel({
  entry,
  onResolved,
}: {
  entry: QueueEntry;
  onResolved: () => void;
}) {
  const d = entry.decision;
  const resolved = entry.queueStatus === "RESOLVED" || !!d.feedback;
  const [reviewer, setReviewer] = React.useState("moderator");
  const [notes, setNotes] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [justAgreed, setJustAgreed] = React.useState<boolean | null>(null);

  async function resolve(finalAction: "ALLOW" | "BLOCK") {
    setSubmitting(true);
    try {
      const { agreesWithAI } = await api<{ agreesWithAI: boolean }>(
        `/api/queue/${d.id}/resolve`,
        {
          method: "POST",
          json: { reviewer: reviewer || "moderator", finalAction, notes },
        },
      );
      setJustAgreed(agreesWithAI);
      setTimeout(onResolved, 700);
    } finally {
      setSubmitting(false);
    }
  }

  if (resolved) {
    const f = d.feedback;
    return (
      <Card className="p-5">
        <SectionTitle
          title="Reviewer decision"
          subtitle="This case has been resolved"
          icon={<UserCheck />}
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="text-sm text-muted">Final action:</span>
          <ActionBadge action={f?.finalAction ?? "ALLOW"} />
          {f && (
            <Badge
              color={
                f.agreesWithAI ? "var(--color-success)" : "var(--color-warning)"
              }
            >
              {f.agreesWithAI ? "Agreed with AI" : "Overrode AI"}
            </Badge>
          )}
          {f?.reviewer && (
            <span className="text-sm text-faint">by {f.reviewer}</span>
          )}
        </div>
        {f?.notes && (
          <p className="mt-3 rounded-lg border border-border bg-surface p-3 text-sm text-muted">
            {f.notes}
          </p>
        )}
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <SectionTitle
          title="Make a decision"
          subtitle={`AI recommends ${d.action}. You have the final say.`}
        />
        <PriorityBadge priority={entry.priority} />
      </div>

      {justAgreed !== null && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-success/40 bg-success/10 p-2.5 text-sm text-success">
          <Check className="h-4 w-4" /> Recorded —{" "}
          {justAgreed ? "agrees with AI" : "overrides AI"}. Updating…
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-faint">
            Reviewer
          </label>
          <Input
            value={reviewer}
            onChange={(e) => setReviewer(e.target.value)}
            placeholder="your name"
          />
        </div>
        <div className="flex items-end gap-2">
          <Button
            variant="success"
            className="flex-1"
            disabled={submitting}
            onClick={() => resolve("ALLOW")}
          >
            <ShieldCheck className="h-4 w-4" /> Allow
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            disabled={submitting}
            onClick={() => resolve("BLOCK")}
          >
            <ShieldX className="h-4 w-4" /> Block
          </Button>
        </div>
      </div>
      <div className="mt-3">
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-faint">
          Notes (optional)
        </label>
        <Textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Rationale for the decision…"
        />
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-faint">
        <Clock className="h-3.5 w-3.5" /> Enqueued {timeAgo(entry.enqueuedAt)} ·
        confidence {pct(d.overallConfidence)}
      </p>
    </Card>
  );
}
