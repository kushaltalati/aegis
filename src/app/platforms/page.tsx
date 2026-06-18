"use client";

import * as React from "react";
import {
  SlidersHorizontal,
  Save,
  Plus,
  Trash2,
  FlaskConical,
  Check,
  RotateCcw,
  ShieldX,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import {
  Card,
  SectionTitle,
  Button,
  Select,
  Input,
  Toggle,
  Slider,
  Spinner,
  Badge,
} from "@/components/ui";
import {
  CategoryIcon,
  categoryLabel,
  ActionBadge,
} from "@/components/moderation";
import {
  api,
  type PlatformSummary,
  type EvalResult,
} from "@/lib/client";
import { HARM_CATEGORIES, type HarmCategory } from "@/lib/categories";
import { pct, cn } from "@/lib/utils";

type CategoryPolicy = {
  enabled: boolean;
  weight: number;
  blockThreshold?: number;
  reviewThreshold?: number;
};
type CustomRule = {
  id: string;
  name: string;
  description: string;
  pattern: string;
  category: HarmCategory;
  action: "ALLOW" | "REVIEW" | "BLOCK";
  enabled: boolean;
};
type PolicySnapshot = {
  engine: "auto" | "gemini" | "local";
  autoBlockThreshold: number;
  reviewThreshold: number;
  historyWeight: number;
  categoryConfig: Record<HarmCategory, CategoryPolicy>;
  customRules: CustomRule[];
};
type PlatformMeta = {
  id: string;
  slug: string;
  name: string;
  description: string;
  audience: string;
  accentColor: string;
};

export default function PlatformsPage() {
  const [platforms, setPlatforms] = React.useState<PlatformSummary[]>([]);
  const [selectedId, setSelectedId] = React.useState<string>("");

  const reloadList = React.useCallback(() => {
    return api<{ platforms: PlatformSummary[] }>("/api/platforms").then((d) => {
      setPlatforms(d.platforms);
      setSelectedId((cur) => cur || d.platforms[0]?.id || "");
    });
  }, []);

  React.useEffect(() => {
    reloadList();
  }, [reloadList]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <SlidersHorizontal className="h-5 w-5 text-primary" />
          Platform Policies
        </h1>
        <p className="mt-1 text-sm text-muted">
          Each platform defines its own thresholds, category toggles, and custom
          rules. A children&apos;s platform and an adult platform moderate
          differently.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
        <div className="space-y-2">
          {platforms.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              className={cn(
                "w-full rounded-xl border p-3 text-left transition-all",
                p.id === selectedId
                  ? "border-primary bg-primary/8"
                  : "border-border bg-card hover:border-border-strong",
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: p.accentColor }}
                />
                <span className="font-medium text-foreground">{p.name}</span>
                <Badge className="ml-auto border-border text-muted">
                  {p.audience}
                </Badge>
              </div>
              <p className="mt-1.5 line-clamp-2 text-xs text-muted">
                {p.description}
              </p>
              {p.policy && (
                <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-faint">
                  <span>{p.policy.enabledCategories.length}/7 categories</span>
                  <span>·</span>
                  <span>block ≥ {pct(p.policy.autoBlockThreshold)}</span>
                  <span>·</span>
                  <span>{p.policy.customRuleCount} rules</span>
                </div>
              )}
            </button>
          ))}
        </div>

        {selectedId && (
          <PolicyEditor
            key={selectedId}
            platformId={selectedId}
            onSaved={reloadList}
          />
        )}
      </div>
    </div>
  );
}

function PolicyEditor({
  platformId,
  onSaved,
}: {
  platformId: string;
  onSaved: () => void;
}) {
  const [meta, setMeta] = React.useState<PlatformMeta | null>(null);
  const [policy, setPolicy] = React.useState<PolicySnapshot | null>(null);
  const [original, setOriginal] = React.useState<string>("");
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    api<{ platform: PlatformMeta; policy: PolicySnapshot }>(
      `/api/platforms/${platformId}`,
    ).then((d) => {
      setMeta(d.platform);
      setPolicy(d.policy);
      setOriginal(JSON.stringify(d.policy));
    });
  }, [platformId]);

  const dirty = policy ? JSON.stringify(policy) !== original : false;

  function patch(p: Partial<PolicySnapshot>) {
    setPolicy((cur) => (cur ? { ...cur, ...p } : cur));
    setSaved(false);
  }
  function patchCategory(cat: HarmCategory, p: Partial<CategoryPolicy>) {
    setPolicy((cur) =>
      cur
        ? {
            ...cur,
            categoryConfig: {
              ...cur.categoryConfig,
              [cat]: { ...cur.categoryConfig[cat], ...p },
            },
          }
        : cur,
    );
    setSaved(false);
  }

  async function save() {
    if (!policy) return;
    setSaving(true);
    setError(null);
    try {
      await api(`/api/platforms/${platformId}/policy`, {
        method: "PATCH",
        json: policy,
      });
      setOriginal(JSON.stringify(policy));
      setSaved(true);
      onSaved();
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    if (original) {
      setPolicy(JSON.parse(original));
      setSaved(false);
    }
  }

  if (!policy || !meta) {
    return (
      <div className="flex items-center justify-center py-20 text-muted">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header / actions */}
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <div className="flex items-center gap-2">
            <span
              className="h-3 w-3 rounded-full"
              style={{ background: meta.accentColor }}
            />
            <h2 className="text-lg font-semibold">{meta.name}</h2>
            <Badge className="border-border text-muted">{meta.audience}</Badge>
          </div>
          <p className="mt-1 max-w-xl text-sm text-muted">{meta.description}</p>
        </div>
        <div className="flex items-center gap-2">
          {error && <span className="text-sm text-danger">{error}</span>}
          {dirty && (
            <Button variant="ghost" size="sm" onClick={reset}>
              <RotateCcw className="h-4 w-4" /> Reset
            </Button>
          )}
          <Button
            variant={saved ? "success" : "primary"}
            onClick={save}
            disabled={saving || (!dirty && !saved)}
          >
            {saving ? (
              <Spinner className="h-4 w-4" />
            ) : saved ? (
              <Check className="h-4 w-4" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saved ? "Saved" : dirty ? "Save changes" : "Saved"}
          </Button>
        </div>
      </Card>

      {/* Engine + global thresholds */}
      <Card className="space-y-5 p-5">
        <SectionTitle
          title="Routing thresholds"
          subtitle="Where confidence lands determines the action"
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-faint">
              Classification engine
            </label>
            <Select
              value={policy.engine}
              onChange={(e) =>
                patch({ engine: e.target.value as PolicySnapshot["engine"] })
              }
            >
              <option value="auto">Auto (Gemini, fall back to local)</option>
              <option value="gemini">Gemini only</option>
              <option value="local">Local engine only</option>
            </Select>
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="font-medium uppercase tracking-wide text-faint">
                History escalation
              </span>
              <span className="tabular text-muted">
                {pct(policy.historyWeight)}
              </span>
            </div>
            <Slider
              value={policy.historyWeight}
              min={0}
              max={1}
              onChange={(v) => patch({ historyWeight: v })}
              accent="var(--color-info)"
            />
          </div>
        </div>

        <ThresholdBand
          review={policy.reviewThreshold}
          block={policy.autoBlockThreshold}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-medium uppercase tracking-wide text-warning">
                <ShieldAlert className="h-3.5 w-3.5" /> Review threshold
              </span>
              <span className="tabular text-foreground">
                {pct(policy.reviewThreshold)}
              </span>
            </div>
            <Slider
              value={policy.reviewThreshold}
              onChange={(v) =>
                patch({
                  reviewThreshold: Math.min(v, policy.autoBlockThreshold),
                })
              }
              accent="var(--color-warning)"
            />
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-medium uppercase tracking-wide text-danger">
                <ShieldX className="h-3.5 w-3.5" /> Auto-block threshold
              </span>
              <span className="tabular text-foreground">
                {pct(policy.autoBlockThreshold)}
              </span>
            </div>
            <Slider
              value={policy.autoBlockThreshold}
              onChange={(v) =>
                patch({
                  autoBlockThreshold: Math.max(v, policy.reviewThreshold),
                })
              }
              accent="var(--color-danger)"
            />
          </div>
        </div>
      </Card>

      {/* Category toggles */}
      <Card className="p-5">
        <SectionTitle
          title="Harm categories"
          subtitle="Toggle categories, weight their signal, and override thresholds per category"
        />
        <div className="mt-4 space-y-2">
          {HARM_CATEGORIES.map((cat) => (
            <CategoryRow
              key={cat}
              category={cat}
              value={policy.categoryConfig[cat]}
              globalBlock={policy.autoBlockThreshold}
              globalReview={policy.reviewThreshold}
              onChange={(p) => patchCategory(cat, p)}
            />
          ))}
        </div>
      </Card>

      {/* Custom rules */}
      <RulesEditor
        rules={policy.customRules}
        onChange={(customRules) => patch({ customRules })}
      />

      {/* Impact tester */}
      <ImpactTester platformId={platformId} dirty={dirty} />
    </div>
  );
}

function ThresholdBand({ review, block }: { review: number; block: number }) {
  return (
    <div>
      <div className="flex h-7 w-full overflow-hidden rounded-lg text-[11px] font-medium">
        <div
          className="flex items-center justify-center text-[#062012]"
          style={{ width: `${review * 100}%`, background: "var(--color-success)" }}
        >
          {review > 0.12 && "ALLOW"}
        </div>
        <div
          className="flex items-center justify-center text-[#1a1206]"
          style={{
            width: `${(block - review) * 100}%`,
            background: "var(--color-warning)",
          }}
        >
          {block - review > 0.12 && "REVIEW"}
        </div>
        <div
          className="flex items-center justify-center text-white"
          style={{ width: `${(1 - block) * 100}%`, background: "var(--color-danger)" }}
        >
          {1 - block > 0.1 && "BLOCK"}
        </div>
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-faint">
        <span>0%</span>
        <span>confidence →</span>
        <span>100%</span>
      </div>
    </div>
  );
}

function CategoryRow({
  category,
  value,
  globalBlock,
  globalReview,
  onChange,
}: {
  category: HarmCategory;
  value: CategoryPolicy;
  globalBlock: number;
  globalReview: number;
  onChange: (p: Partial<CategoryPolicy>) => void;
}) {
  const [expanded, setExpanded] = React.useState(false);
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-surface p-3 transition-opacity",
        !value.enabled && "opacity-60",
      )}
    >
      <div className="flex items-center gap-3">
        <Toggle
          checked={value.enabled}
          onChange={(v) => onChange({ enabled: v })}
          label={`Toggle ${categoryLabel(category)}`}
        />
        <CategoryIcon category={category} className="h-4 w-4" />
        <span className="text-sm font-medium text-foreground">
          {categoryLabel(category)}
        </span>
        <div className="ml-auto flex items-center gap-3">
          <div className="hidden w-40 items-center gap-2 sm:flex">
            <span className="text-xs text-faint">weight</span>
            <Slider
              value={value.weight}
              min={0}
              max={2}
              step={0.05}
              disabled={!value.enabled}
              onChange={(v) => onChange({ weight: v })}
            />
            <span className="tabular w-8 text-right text-xs text-muted">
              {value.weight.toFixed(2)}
            </span>
          </div>
          <button
            onClick={() => setExpanded((x) => !x)}
            disabled={!value.enabled}
            className="text-xs text-primary hover:underline disabled:opacity-40"
          >
            {expanded ? "Hide" : "Overrides"}
          </button>
        </div>
      </div>

      {expanded && value.enabled && (
        <div className="mt-3 grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
          <ThresholdOverride
            label="Review override"
            accent="var(--color-warning)"
            global={globalReview}
            value={value.reviewThreshold}
            onChange={(reviewThreshold) => onChange({ reviewThreshold })}
          />
          <ThresholdOverride
            label="Block override"
            accent="var(--color-danger)"
            global={globalBlock}
            value={value.blockThreshold}
            onChange={(blockThreshold) => onChange({ blockThreshold })}
          />
          <div className="sm:col-span-2 sm:hidden">
            <span className="text-xs text-faint">weight: {value.weight.toFixed(2)}</span>
            <Slider
              value={value.weight}
              min={0}
              max={2}
              step={0.05}
              onChange={(v) => onChange({ weight: v })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ThresholdOverride({
  label,
  accent,
  global,
  value,
  onChange,
}: {
  label: string;
  accent: string;
  global: number;
  value?: number;
  onChange: (v: number | undefined) => void;
}) {
  const active = value !== undefined;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="text-faint">{label}</span>
        <button
          onClick={() => onChange(active ? undefined : global)}
          className="text-[11px] text-primary hover:underline"
        >
          {active ? "use global" : "override"}
        </button>
      </div>
      {active ? (
        <div className="flex items-center gap-2">
          <Slider value={value} onChange={onChange} accent={accent} />
          <span className="tabular w-9 text-right text-xs text-foreground">
            {pct(value)}
          </span>
        </div>
      ) : (
        <div className="text-xs text-faint">
          inherits global ({pct(global)})
        </div>
      )}
    </div>
  );
}

function RulesEditor({
  rules,
  onChange,
}: {
  rules: CustomRule[];
  onChange: (r: CustomRule[]) => void;
}) {
  function add() {
    const id = `rule-${Math.round(performance.now())}-${rules.length}`;
    onChange([
      ...rules,
      {
        id,
        name: "New rule",
        description: "",
        pattern: "",
        category: "harassment",
        action: "REVIEW",
        enabled: true,
      },
    ]);
  }
  function update(i: number, p: Partial<CustomRule>) {
    onChange(rules.map((r, j) => (j === i ? { ...r, ...p } : r)));
  }
  function remove(i: number) {
    onChange(rules.filter((_, j) => j !== i));
  }

  return (
    <Card className="p-5">
      <SectionTitle
        title="Custom rules"
        subtitle="Regex patterns that force an action — overrides win over thresholds"
        action={
          <Button variant="secondary" size="sm" onClick={add}>
            <Plus className="h-4 w-4" /> Add rule
          </Button>
        }
      />
      <div className="mt-4 space-y-3">
        {rules.length === 0 && (
          <p className="text-sm text-faint">
            No custom rules. Add one to force BLOCK/REVIEW/ALLOW on a pattern.
          </p>
        )}
        {rules.map((r, i) => (
          <div
            key={r.id}
            className="rounded-lg border border-border bg-surface p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Toggle
                checked={r.enabled}
                onChange={(v) => update(i, { enabled: v })}
                label="Toggle rule"
              />
              <Input
                className="w-40"
                value={r.name}
                onChange={(e) => update(i, { name: e.target.value })}
                placeholder="Rule name"
              />
              <Select
                className="w-auto"
                value={r.category}
                onChange={(e) =>
                  update(i, { category: e.target.value as HarmCategory })
                }
              >
                {HARM_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {categoryLabel(c)}
                  </option>
                ))}
              </Select>
              <Select
                className="w-auto"
                value={r.action}
                onChange={(e) =>
                  update(i, { action: e.target.value as CustomRule["action"] })
                }
              >
                <option value="ALLOW">Force Allow</option>
                <option value="REVIEW">Force Review</option>
                <option value="BLOCK">Force Block</option>
              </Select>
              <button
                aria-label="Delete rule"
                onClick={() => remove(i)}
                className="ml-auto rounded-lg border border-border p-2 text-faint hover:text-danger"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="font-mono text-xs text-faint">/regex/i</span>
              <Input
                className="font-mono text-xs"
                value={r.pattern}
                onChange={(e) => update(i, { pattern: e.target.value })}
                placeholder="pattern, e.g. (kill|hurt) (you|u)"
              />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ImpactTester({
  platformId,
  dirty,
}: {
  platformId: string;
  dirty: boolean;
}) {
  const [running, setRunning] = React.useState(false);
  const [res, setRes] = React.useState<EvalResult | null>(null);

  async function run() {
    setRunning(true);
    try {
      const r = await api<EvalResult>("/api/evaluate", {
        method: "POST",
        json: { platformId },
      });
      setRes(r);
    } finally {
      setRunning(false);
    }
  }

  const dist = res
    ? res.results.reduce(
        (acc, r) => {
          acc[r.action] = (acc[r.action] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      )
    : null;

  return (
    <Card className="p-5">
      <SectionTitle
        title="Test impact"
        subtitle="Run the labelled test set against the SAVED policy to see how it behaves"
        icon={<FlaskConical />}
        action={
          <Button variant="secondary" size="sm" onClick={run} disabled={running}>
            {running ? <Spinner className="h-4 w-4" /> : <FlaskConical className="h-4 w-4" />}
            Run test set
          </Button>
        }
      />
      {dirty && (
        <p className="mt-2 text-xs text-warning">
          Unsaved changes — save first to test them.
        </p>
      )}
      {res && dist && (
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-faint">
              Accuracy
            </div>
            <div className="text-2xl font-semibold tabular">
              {pct(res.accuracy)}
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            {(["ALLOW", "REVIEW", "BLOCK"] as const).map((a) => (
              <div key={a} className="flex items-center gap-2">
                <ActionBadge action={a} size="sm" />
                <span className="tabular text-sm font-medium">
                  {dist[a] ?? 0}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
