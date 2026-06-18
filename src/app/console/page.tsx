"use client";

import * as React from "react";
import {
  FlaskConical,
  Play,
  Plus,
  Trash2,
  Sparkles,
  ListChecks,
  Check,
  X,
  GitCompareArrows,
  Upload,
  UserPlus,
} from "lucide-react";
import {
  Card,
  SectionTitle,
  Button,
  Select,
  Textarea,
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
  type AuthorSummary,
  type SerializedDecision,
  type EvalResult,
} from "@/lib/client";
import { HARM_CATEGORIES } from "@/lib/categories";
import { pct, cn } from "@/lib/utils";

type Sample = {
  id: string;
  text: string;
  expected: string;
  note: string;
  thread?: { author: string; text: string }[];
  suggestPlatform?: string;
  pairId?: string;
  source?: "builtin" | "custom";
};

type Tab = "classify" | "evaluate";

export default function ConsolePage() {
  const [tab, setTab] = React.useState<Tab>("classify");
  const [platforms, setPlatforms] = React.useState<PlatformSummary[]>([]);
  const [authors, setAuthors] = React.useState<AuthorSummary[]>([]);
  const [samples, setSamples] = React.useState<Sample[]>([]);

  const [platformId, setPlatformId] = React.useState("");
  const [authorId, setAuthorId] = React.useState("");
  const [text, setText] = React.useState("");
  const [note, setNote] = React.useState("");
  const [thread, setThread] = React.useState<{ author: string; text: string }[]>(
    [],
  );

  const [running, setRunning] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<SerializedDecision | null>(null);

  React.useEffect(() => {
    api<{ platforms: PlatformSummary[] }>("/api/platforms").then((d) => {
      setPlatforms(d.platforms);
      setPlatformId((cur) => cur || d.platforms[0]?.id || "");
    });
    api<{ authors: AuthorSummary[] }>("/api/authors").then((d) =>
      setAuthors(d.authors),
    );
    api<{ samples: Sample[] }>("/api/samples").then((d) => setSamples(d.samples));
  }, []);

  function loadSample(s: Sample) {
    setText(s.text);
    setThread(s.thread ?? []);
    setNote("");
    setResult(null);
    setError(null);
    if (s.suggestPlatform) {
      const p = platforms.find((x) => x.slug === s.suggestPlatform);
      if (p) setPlatformId(p.id);
    }
  }

  async function classify() {
    if (!text.trim() || !platformId) return;
    setRunning(true);
    setError(null);
    try {
      const { decision } = await api<{ decision: SerializedDecision }>(
        "/api/moderate",
        {
          method: "POST",
          json: {
            platformId,
            text,
            authorId: authorId || null,
            thread: thread.length ? thread : undefined,
            note: note || undefined,
          },
        },
      );
      setResult(decision);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Classification failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <FlaskConical className="h-5 w-5 text-primary" />
          Test Console
        </h1>
        <p className="mt-1 text-sm text-muted">
          Submit content through the live pipeline, or evaluate the labelled
          test set against a platform&apos;s policy.
        </p>
      </div>

      <div className="flex w-fit gap-1 rounded-lg border border-border bg-surface p-1">
        <TabButton active={tab === "classify"} onClick={() => setTab("classify")}>
          <Play className="h-4 w-4" /> Classify
        </TabButton>
        <TabButton active={tab === "evaluate"} onClick={() => setTab("evaluate")}>
          <ListChecks className="h-4 w-4" /> Test-set evaluation
        </TabButton>
      </div>

      {tab === "classify" ? (
        <div className="grid gap-5 lg:grid-cols-2">
          {/* Composer */}
          <div className="space-y-4">
            <Card className="space-y-4 p-5">
              <SectionTitle
                title="Compose content"
                subtitle="The same text can route differently per context"
              />

              <div className="grid grid-cols-2 gap-3">
                <Field label="Platform">
                  <Select
                    value={platformId}
                    onChange={(e) => setPlatformId(e.target.value)}
                  >
                    {platforms.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.audience})
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Author (history)">
                  <Select
                    value={authorId}
                    onChange={(e) => setAuthorId(e.target.value)}
                  >
                    <option value="">Anonymous</option>
                    {authors.map((a) => (
                      <option key={a.id} value={a.id}>
                        @{a.handle} · trust {pct(a.trustScore)}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <Field label="Content">
                <Textarea
                  rows={4}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Type or paste content to moderate…"
                />
              </Field>

              {/* Thread builder */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-xs font-medium uppercase tracking-wide text-faint">
                    Conversation thread (context)
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setThread((t) => [...t, { author: "", text: "" }])
                    }
                    className="flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add message
                  </button>
                </div>
                <div className="space-y-2">
                  {thread.map((m, i) => (
                    <div key={i} className="flex gap-2">
                      <Input
                        className="w-28"
                        placeholder="@author"
                        value={m.author}
                        onChange={(e) =>
                          setThread((t) =>
                            t.map((x, j) =>
                              j === i ? { ...x, author: e.target.value } : x,
                            ),
                          )
                        }
                      />
                      <Input
                        placeholder="message text"
                        value={m.text}
                        onChange={(e) =>
                          setThread((t) =>
                            t.map((x, j) =>
                              j === i ? { ...x, text: e.target.value } : x,
                            ),
                          )
                        }
                      />
                      <button
                        type="button"
                        aria-label="Remove message"
                        onClick={() =>
                          setThread((t) => t.filter((_, j) => j !== i))
                        }
                        className="rounded-lg border border-border px-2 text-faint hover:text-danger"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  {thread.length === 0 && (
                    <p className="text-xs text-faint">
                      No thread — content is judged on its own.
                    </p>
                  )}
                </div>
              </div>

              <Field label="Moderator note (optional)">
                <Input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. reported by 3 users"
                />
              </Field>

              <div className="flex items-center gap-3">
                <Button
                  variant="primary"
                  onClick={classify}
                  disabled={running || !text.trim()}
                >
                  {running ? (
                    <Spinner className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  {running ? "Classifying…" : "Run pipeline"}
                </Button>
                {error && <span className="text-sm text-danger">{error}</span>}
              </div>
            </Card>

            {/* Sample library */}
            <SampleLibrary
              samples={samples}
              platforms={platforms}
              onLoad={loadSample}
              onSamplesChange={setSamples}
            />
          </div>

          {/* Result */}
          <div>
            {running ? (
              <Card className="flex h-full min-h-[300px] flex-col items-center justify-center gap-3 p-8 text-muted">
                <Spinner className="h-7 w-7 text-primary" />
                <p className="text-sm">Running classification & routing…</p>
              </Card>
            ) : result ? (
              <div className="animate-fade-up">
                <DecisionDetail decision={result} />
              </div>
            ) : (
              <EmptyState
                icon={<FlaskConical />}
                title="No result yet"
                description="Compose content and run the pipeline to see the explainable decision, per-category confidence, and routing trace."
              />
            )}
          </div>
        </div>
      ) : (
        <EvaluatePanel platforms={platforms} samples={samples} />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-primary/15 text-foreground"
          : "text-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-faint">
        {label}
      </label>
      {children}
    </div>
  );
}

function SampleLibrary({
  samples,
  platforms,
  onLoad,
  onSamplesChange,
}: {
  samples: Sample[];
  platforms: PlatformSummary[];
  onLoad: (s: Sample) => void;
  onSamplesChange: React.Dispatch<React.SetStateAction<Sample[]>>;
}) {
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [showForm, setShowForm] = React.useState(false);
  const [addText, setAddText] = React.useState("");
  const [addExpected, setAddExpected] = React.useState("benign");
  const [addNote, setAddNote] = React.useState("");
  const [addPlatform, setAddPlatform] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [importMsg, setImportMsg] = React.useState<string | null>(null);

  async function refreshSamples() {
    const d = await api<{ samples: Sample[] }>("/api/samples");
    onSamplesChange(d.samples);
  }

  async function saveSample() {
    if (!addText.trim()) return;
    setSaving(true);
    try {
      await api("/api/samples", {
        method: "POST",
        json: {
          text: addText.trim(),
          expected: addExpected,
          note: addNote.trim(),
          suggestPlatform: addPlatform || undefined,
        },
      });
      await refreshSamples();
      setAddText(""); setAddNote(""); setAddPlatform(""); setShowForm(false);
    } finally {
      setSaving(false);
    }
  }

  async function deleteSample(id: string) {
    await api(`/api/samples/${id}`, { method: "DELETE" });
    onSamplesChange((prev) => prev.filter((s) => s.id !== id));
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const isCsv = file.name.endsWith(".csv");
    setImportMsg(null);
    try {
      const res = await fetch("/api/samples/import", {
        method: "POST",
        headers: { "Content-Type": isCsv ? "text/csv" : "application/json" },
        body: text,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      setImportMsg(`Imported ${data.inserted} sample${data.inserted !== 1 ? "s" : ""}${data.errors?.length ? ` (${data.errors.length} skipped)` : ""}`);
      await refreshSamples();
    } catch (err) {
      setImportMsg(err instanceof Error ? err.message : "Import failed");
    }
    e.target.value = "";
  }

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-start justify-between gap-2">
        <SectionTitle
          title="Labelled samples"
          subtitle="Click to load. Pairs show context sensitivity."
          icon={<Sparkles />}
        />
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            title="Import JSON or CSV file"
            className="flex items-center gap-1 rounded-md border border-border bg-elevated px-2 py-1 text-xs text-muted transition-colors hover:border-primary hover:text-foreground"
          >
            <Upload className="h-3.5 w-3.5" /> Import
          </button>
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-1 rounded-md border border-border bg-elevated px-2 py-1 text-xs text-muted transition-colors hover:border-primary hover:text-foreground"
          >
            <UserPlus className="h-3.5 w-3.5" /> Add
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,.csv"
            className="hidden"
            onChange={handleFile}
          />
        </div>
      </div>

      {importMsg && (
        <p className="mb-2 text-xs text-success">{importMsg}</p>
      )}

      {showForm && (
        <div className="mb-4 space-y-2 rounded-lg border border-border bg-elevated p-3">
          <p className="text-xs font-medium text-faint uppercase tracking-wide">New sample</p>
          <Textarea
            rows={2}
            value={addText}
            onChange={(e) => setAddText(e.target.value)}
            placeholder="Sample text to classify…"
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs text-faint">Expected label</label>
              <Select value={addExpected} onChange={(e) => setAddExpected(e.target.value)}>
                <option value="benign">benign</option>
                {HARM_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{categoryLabel(c)}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-faint">Platform hint (optional)</label>
              <Select value={addPlatform} onChange={(e) => setAddPlatform(e.target.value)}>
                <option value="">Any</option>
                {platforms.map((p) => (
                  <option key={p.id} value={p.slug}>{p.name}</option>
                ))}
              </Select>
            </div>
          </div>
          <Input
            value={addNote}
            onChange={(e) => setAddNote(e.target.value)}
            placeholder="Note (optional)"
          />
          <div className="flex gap-2">
            <Button variant="primary" onClick={saveSample} disabled={saving || !addText.trim()}>
              {saving ? <Spinner className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              Save
            </Button>
            <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {samples.map((s) => (
          <div key={s.id} className="group relative flex items-center gap-1.5 rounded-lg border border-border bg-elevated transition-colors hover:border-primary">
            <button
              onClick={() => onLoad(s)}
              title={s.note}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs"
            >
              {s.pairId && <GitCompareArrows className="h-3.5 w-3.5 text-accent" />}
              {s.source === "custom" && <UserPlus className="h-3 w-3 text-primary/70" />}
              <span className="text-muted group-hover:text-foreground">
                {s.expected === "benign" ? "benign" : categoryLabel(s.expected)}
              </span>
            </button>
            {s.source === "custom" && (
              <button
                type="button"
                aria-label="Delete sample"
                onClick={() => deleteSample(s.id)}
                className="pr-1.5 text-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-danger"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
        {samples.length === 0 && (
          <p className="text-xs text-faint">No samples yet. Add one above or import a file.</p>
        )}
      </div>
    </Card>
  );
}

function EvaluatePanel({
  platforms,
  samples,
}: {
  platforms: PlatformSummary[];
  samples: Sample[];
}) {
  const [platformId, setPlatformId] = React.useState("");
  const [running, setRunning] = React.useState(false);
  const [res, setRes] = React.useState<EvalResult | null>(null);

  React.useEffect(() => {
    if (!platformId && platforms[0]) setPlatformId(platforms[0].id);
  }, [platforms, platformId]);

  async function run() {
    if (!platformId) return;
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

  const sampleNote = (id: string) => samples.find((s) => s.id === id)?.note;

  return (
    <div className="space-y-5">
      <Card className="flex flex-wrap items-end gap-4 p-5">
        <div className="flex-1">
          <SectionTitle
            title="Batch evaluation"
            subtitle="Run the labelled test set through a platform's policy and measure accuracy."
          />
        </div>
        <div className="w-56">
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-faint">
            Platform
          </label>
          <Select
            value={platformId}
            onChange={(e) => setPlatformId(e.target.value)}
          >
            {platforms.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.audience})
              </option>
            ))}
          </Select>
        </div>
        <Button variant="primary" onClick={run} disabled={running}>
          {running ? <Spinner className="h-4 w-4" /> : <ListChecks className="h-4 w-4" />}
          {running ? "Evaluating…" : "Run evaluation"}
        </Button>
      </Card>

      {res && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card className="p-4">
              <div className="text-xs uppercase tracking-wide text-faint">
                Accuracy
              </div>
              <div className="mt-1 text-3xl font-semibold tabular text-foreground">
                {pct(res.accuracy)}
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-xs uppercase tracking-wide text-faint">
                Correct
              </div>
              <div className="mt-1 text-3xl font-semibold tabular text-success">
                {res.correct}
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-xs uppercase tracking-wide text-faint">
                Total
              </div>
              <div className="mt-1 text-3xl font-semibold tabular text-foreground">
                {res.total}
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-xs uppercase tracking-wide text-faint">
                Platform
              </div>
              <div className="mt-1 text-lg font-semibold text-foreground">
                {res.platform.name}
              </div>
              <Badge className="mt-1 border-border text-muted">
                {res.platform.audience}
              </Badge>
            </Card>
          </div>

          <Card className="overflow-hidden">
            <div className="border-b border-border px-4 py-3">
              <SectionTitle
                title="Per-sample results"
                subtitle="Pairs (⇄) demonstrate identical-text, different-context handling."
              />
            </div>
            <div className="divide-y divide-border">
              {res.results.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center gap-3 px-4 py-3 text-sm"
                >
                  <span
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                      r.correct
                        ? "bg-success/20 text-success"
                        : "bg-danger/20 text-danger",
                    )}
                  >
                    {r.correct ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <X className="h-3.5 w-3.5" />
                    )}
                  </span>
                  {r.pairId && (
                    <GitCompareArrows
                      className="h-4 w-4 shrink-0 text-accent"
                      aria-label="context pair"
                    />
                  )}
                  <span
                    className="min-w-0 flex-1 truncate text-muted"
                    title={sampleNote(r.id)}
                  >
                    {r.text}
                  </span>
                  <span className="hidden shrink-0 items-center gap-2 md:flex">
                    <span className="text-xs text-faint">expected</span>
                    {r.expected === "benign" ? (
                      <Badge className="border-border text-muted">benign</Badge>
                    ) : (
                      <CategoryChip category={r.expected} />
                    )}
                  </span>
                  <span className="hidden shrink-0 items-center gap-2 lg:flex">
                    <span className="text-xs text-faint">→ got</span>
                    {r.predicted === "benign" ? (
                      <Badge className="border-border text-muted">benign</Badge>
                    ) : (
                      <CategoryChip category={r.predicted} />
                    )}
                  </span>
                  <ActionBadge action={r.action} size="sm" />
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      {!res && !running && (
        <EmptyState
          icon={<ListChecks />}
          title="No evaluation run yet"
          description="Pick a platform and run the labelled test set. Try the same set on KidSpace vs OpenForum to see policy change the outcomes."
        />
      )}
    </div>
  );
}
