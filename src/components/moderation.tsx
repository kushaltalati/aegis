import * as React from "react";
import {
  Flame,
  Swords,
  Megaphone,
  AlertTriangle,
  Skull,
  EyeOff,
  HeartCrack,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Bot,
  Cpu,
  User,
  MessageSquare,
  GitBranch,
  type LucideIcon,
} from "lucide-react";
import { CATEGORY_META, type HarmCategory } from "@/lib/categories";
import type { SerializedDecision } from "@/lib/serialize";
import { cn, pct } from "@/lib/utils";
import { Badge, Card } from "./ui";

const CATEGORY_ICONS: Record<HarmCategory, LucideIcon> = {
  hate_speech: Flame,
  harassment: Swords,
  spam: Megaphone,
  misinformation: AlertTriangle,
  graphic_violence: Skull,
  adult_content: EyeOff,
  self_harm: HeartCrack,
};

export function categoryColor(category: string): string {
  return (CATEGORY_META as Record<string, { color: string }>)[category]?.color ?? "#64748b";
}
export function categoryLabel(category: string): string {
  return (
    (CATEGORY_META as Record<string, { label: string }>)[category]?.label ??
    category.replace(/_/g, " ")
  );
}

export function CategoryIcon({
  category,
  className,
}: {
  category: string;
  className?: string;
}) {
  const Icon = CATEGORY_ICONS[category as HarmCategory] ?? AlertTriangle;
  return <Icon className={className} style={{ color: categoryColor(category) }} />;
}

export function CategoryChip({
  category,
  confidence,
}: {
  category: string;
  confidence?: number;
}) {
  const color = categoryColor(category);
  return (
    <Badge color={color}>
      <CategoryIcon category={category} className="h-3 w-3" />
      {categoryLabel(category)}
      {confidence !== undefined && (
        <span className="tabular opacity-80">{pct(confidence)}</span>
      )}
    </Badge>
  );
}

// ---- Action & status badges ------------------------------------------------

const ACTION_STYLE: Record<
  string,
  { color: string; icon: LucideIcon; label: string }
> = {
  ALLOW: { color: "var(--color-success)", icon: ShieldCheck, label: "Allowed" },
  REVIEW: { color: "var(--color-warning)", icon: ShieldAlert, label: "Review" },
  BLOCK: { color: "var(--color-danger)", icon: ShieldX, label: "Blocked" },
};

export function ActionBadge({
  action,
  size = "md",
}: {
  action: string;
  size?: "sm" | "md";
}) {
  const s = ACTION_STYLE[action] ?? ACTION_STYLE.REVIEW;
  const Icon = s.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border font-semibold uppercase tracking-wide",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
      )}
      style={{
        color: s.color,
        borderColor: `${s.color}` + "55",
        background: `${s.color}` + "14",
      }}
    >
      <Icon className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />
      {s.label}
    </span>
  );
}

const PRIORITY_COLOR: Record<string, string> = {
  URGENT: "var(--color-danger)",
  HIGH: "var(--color-warning)",
  MEDIUM: "var(--color-info)",
  LOW: "var(--color-muted)",
};

export function PriorityBadge({ priority }: { priority: string }) {
  const color = PRIORITY_COLOR[priority] ?? "var(--color-muted)";
  return (
    <span
      className="inline-flex items-center gap-1 rounded text-[11px] font-semibold uppercase tracking-wide"
      style={{ color }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: color }}
      />
      {priority}
    </span>
  );
}

const ENGINE_META: Record<
  string,
  { label: string; color: string; title: string; ai: boolean }
> = {
  gemini: {
    label: "Gemini",
    color: "var(--color-primary)",
    title: "Classified by Gemini",
    ai: true,
  },
  groq: {
    label: "Groq",
    color: "var(--color-info)",
    title: "Classified by the Groq fallback model",
    ai: true,
  },
  local: {
    label: "Local engine",
    color: "var(--color-muted)",
    title: "Classified by the local lexical fallback engine",
    ai: false,
  },
};

export function EngineBadge({ engine }: { engine: string }) {
  const meta = ENGINE_META[engine] ?? ENGINE_META.local;
  return (
    <Badge color={meta.color} title={meta.title}>
      {meta.ai ? <Bot className="h-3 w-3" /> : <Cpu className="h-3 w-3" />}
      {meta.label}
    </Badge>
  );
}

// ---- Confidence visualisations ---------------------------------------------

export function ConfidenceMeter({
  value,
  accent = "var(--color-primary)",
  label,
}: {
  value: number;
  accent?: string;
  label?: string;
}) {
  return (
    <div>
      {label && (
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="text-muted">{label}</span>
          <span className="tabular font-medium text-foreground">
            {pct(value)}
          </span>
        </div>
      )}
      <div className="h-2 w-full overflow-hidden rounded-full bg-elevated">
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${Math.max(2, value * 100)}%`, background: accent }}
        />
      </div>
    </div>
  );
}

/** Horizontal bars for every category's confidence (disabled ones muted). */
export function ScoreBars({
  scores,
}: {
  scores: SerializedDecision["scores"];
}) {
  return (
    <div className="space-y-2.5">
      {scores.map((s) => {
        const color = categoryColor(s.category);
        return (
          <div key={s.category} className={cn(!s.enabled && "opacity-40")}>
            <div className="mb-1 flex items-center justify-between gap-2 text-xs">
              <span className="flex items-center gap-1.5 text-muted">
                <CategoryIcon category={s.category} className="h-3.5 w-3.5" />
                {categoryLabel(s.category)}
                {!s.enabled && (
                  <span className="text-[10px] uppercase text-faint">
                    off
                  </span>
                )}
                {s.triggeredRule && (
                  <span
                    className="text-[10px] uppercase"
                    style={{ color: "var(--color-accent)" }}
                  >
                    rule
                  </span>
                )}
              </span>
              <span className="tabular font-medium text-foreground">
                {pct(s.confidence)}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-elevated">
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{
                  width: `${Math.max(s.confidence > 0 ? 2 : 0, s.confidence * 100)}%`,
                  background: color,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---- Explainability: highlighted content -----------------------------------

type Seg = SerializedDecision["segments"][number];

/** Renders the content with offending spans highlighted by category colour. */
export function HighlightedContent({
  text,
  segments,
  className,
}: {
  text: string;
  segments: Seg[];
  className?: string;
}) {
  const valid = segments
    .filter((s) => s.start >= 0 && s.end > s.start && s.end <= text.length)
    .sort((a, b) => a.start - b.start);

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let key = 0;
  for (const seg of valid) {
    if (seg.start < cursor) continue; // skip overlaps
    if (seg.start > cursor) {
      parts.push(<span key={key++}>{text.slice(cursor, seg.start)}</span>);
    }
    const color = categoryColor(seg.category);
    parts.push(
      <mark
        key={key++}
        title={`${categoryLabel(seg.category)} — ${pct(seg.confidence)}`}
        className="rounded px-0.5 font-medium"
        style={{
          background: `${color}26`,
          color: "var(--color-foreground)",
          boxShadow: `inset 0 -2px 0 ${color}`,
        }}
      >
        {text.slice(seg.start, seg.end)}
      </mark>,
    );
    cursor = seg.end;
  }
  if (cursor < text.length) {
    parts.push(<span key={key++}>{text.slice(cursor)}</span>);
  }

  return (
    <p
      className={cn(
        "whitespace-pre-wrap break-words text-[15px] leading-relaxed text-foreground",
        className,
      )}
    >
      {parts.length ? parts : text}
    </p>
  );
}

// ---- Routing trace ---------------------------------------------------------

export function RoutingTrace({ trace }: { trace: string[] }) {
  if (!trace.length) return null;
  return (
    <ol className="space-y-1.5">
      {trace.map((line, i) => (
        <li key={i} className="flex gap-2.5 text-sm">
          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-border-strong" />
          <span className="font-mono text-[12.5px] leading-relaxed text-muted">
            {line}
          </span>
        </li>
      ))}
    </ol>
  );
}

// ---- Context panel ---------------------------------------------------------

function trustColor(score: number) {
  if (score >= 0.66) return "var(--color-success)";
  if (score >= 0.33) return "var(--color-warning)";
  return "var(--color-danger)";
}

export function ContextPanel({
  content,
  platform,
}: {
  content: SerializedDecision["content"];
  platform: SerializedDecision["platform"];
}) {
  const author = content.author;
  const thread = (content.context?.thread ?? []) as {
    author: string;
    text: string;
  }[];
  const note = content.context?.note;

  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-center gap-2">
        <span
          className="h-2 w-2 rounded-full"
          style={{ background: platform.accentColor }}
        />
        <span className="font-medium text-foreground">{platform.name}</span>
        <Badge className="border-border text-muted">{platform.audience}</Badge>
      </div>

      {author ? (
        <div className="rounded-lg border border-border bg-surface p-3">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted" />
            <span className="font-medium text-foreground">
              {author.displayName}
            </span>
            <span className="font-mono text-xs text-faint">@{author.handle}</span>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
            <div>
              <div className="text-faint">Trust</div>
              <div
                className="tabular font-semibold"
                style={{ color: trustColor(author.trustScore) }}
              >
                {pct(author.trustScore)}
              </div>
            </div>
            <div>
              <div className="text-faint">Violations</div>
              <div className="tabular font-semibold text-foreground">
                {author.priorViolations}
              </div>
            </div>
            <div>
              <div className="text-faint">Account age</div>
              <div className="tabular font-semibold text-foreground">
                {author.accountAgeDays}d
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-xs text-faint">
          <User className="h-3.5 w-3.5" /> Anonymous author
        </div>
      )}

      {thread.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-faint">
            <MessageSquare className="h-3.5 w-3.5" /> Conversation thread
          </div>
          <div className="space-y-1.5">
            {thread.map((m, i) => (
              <div
                key={i}
                className="rounded-lg border border-border bg-surface px-3 py-2 text-[13px]"
              >
                <span className="font-mono text-xs text-faint">@{m.author}</span>
                <p className="mt-0.5 text-muted">{m.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {note && (
        <div className="rounded-lg border border-border bg-surface px-3 py-2 text-[13px] text-muted">
          <span className="text-faint">Note: </span>
          {note}
        </div>
      )}
    </div>
  );
}

// ---- Full explainable decision panel (shared by Queue + Decisions) ---------

export function DecisionDetail({
  decision,
  showContext = true,
}: {
  decision: SerializedDecision;
  showContext?: boolean;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="space-y-4 lg:col-span-3">
        <Card className="p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <ActionBadge action={decision.action} />
            {decision.topCategory && (
              <CategoryChip
                category={decision.topCategory}
                confidence={decision.overallConfidence}
              />
            )}
            <EngineBadge engine={decision.engine} />
            <span className="ml-auto font-mono text-xs text-faint">
              {decision.latencyMs}ms
            </span>
          </div>
          <HighlightedContent
            text={decision.content.text}
            segments={decision.segments}
          />
        </Card>

        <Card className="p-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-faint">
            <Bot className="h-3.5 w-3.5" /> AI reasoning
          </div>
          <p className="text-sm leading-relaxed text-foreground">
            {decision.reasoning}
          </p>
        </Card>

        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-faint">
            <GitBranch className="h-3.5 w-3.5" /> Routing trace
          </div>
          <RoutingTrace trace={decision.routingTrace} />
        </Card>
      </div>

      <div className="space-y-4 lg:col-span-2">
        <Card className="p-4">
          <div className="mb-3 text-xs font-medium uppercase tracking-wide text-faint">
            Category confidence
          </div>
          <ScoreBars scores={decision.scores} />
        </Card>

        {showContext && (
          <Card className="p-4">
            <div className="mb-3 text-xs font-medium uppercase tracking-wide text-faint">
              Context
            </div>
            <ContextPanel
              content={decision.content}
              platform={decision.platform}
            />
          </Card>
        )}
      </div>
    </div>
  );
}
