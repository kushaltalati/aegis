"use client";

import * as React from "react";
import Link from "next/link";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import {
  Activity,
  ShieldX,
  ShieldAlert,
  Gauge,
  Timer,
  ThumbsUp,
  LayoutDashboard,
  ArrowUpRight,
} from "lucide-react";
import {
  Card,
  SectionTitle,
  StatTile,
  Select,
  Skeleton,
  EmptyState,
  Button,
} from "@/components/ui";
import {
  ActionBadge,
  CategoryChip,
  EngineBadge,
  categoryColor,
  categoryLabel,
} from "@/components/moderation";
import { api, type Analytics } from "@/lib/client";
import { pct, timeAgo } from "@/lib/utils";

const ACTION_COLORS: Record<string, string> = {
  ALLOW: "#22c55e",
  REVIEW: "#f59e0b",
  BLOCK: "#ef4444",
};

const tooltipStyle: React.CSSProperties = {
  background: "#131a28",
  border: "1px solid #232d3f",
  borderRadius: 10,
  fontSize: 12,
};

export default function DashboardPage() {
  const [data, setData] = React.useState<Analytics | null>(null);
  const [platformId, setPlatformId] = React.useState<string>("");
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    api<Analytics>(
      `/api/analytics${platformId ? `?platformId=${platformId}` : ""}`,
    )
      .then((d) => active && setData(d))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [platformId]);

  const actionData = data
    ? Object.entries(data.actionCounts)
        .filter(([, v]) => v > 0)
        .map(([name, value]) => ({ name, value }))
    : [];

  const categoryData = data
    ? Object.entries(data.categoryCounts)
        .filter(([, v]) => v > 0)
        .map(([category, value]) => ({
          category,
          label: categoryLabel(category),
          value,
          fill: categoryColor(category),
        }))
        .sort((a, b) => b.value - a.value)
    : [];

  const engineTotal = data
    ? Object.values(data.engineCounts).reduce((a, b) => a + b, 0)
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <LayoutDashboard className="h-5 w-5 text-primary" />
            Operations Overview
          </h1>
          <p className="mt-1 text-sm text-muted">
            Live state of the moderation pipeline — classification, routing, and
            human review.
          </p>
        </div>
        <div className="w-full sm:w-56">
          <Select
            value={platformId}
            onChange={(e) => setPlatformId(e.target.value)}
            aria-label="Filter by platform"
          >
            <option value="">All platforms</option>
            {data?.byPlatform.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {loading && !data ? (
        <DashboardSkeleton />
      ) : data && data.total === 0 ? (
        <EmptyState
          icon={<Activity />}
          title="No decisions yet"
          description="Run content through the Test Console to populate the dashboard."
          action={
            <Link href="/console">
              <Button variant="primary">Open Test Console</Button>
            </Link>
          }
        />
      ) : data ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-6">
            <div className="animate-fade-up">
              <StatTile
                label="Decisions"
                value={data.total}
                icon={<Gauge />}
                hint="total processed"
              />
            </div>
            <div className="animate-fade-up" style={{ animationDelay: "40ms" }}>
              <StatTile
                label="Blocked"
                value={data.actionCounts.BLOCK ?? 0}
                accent="var(--color-danger)"
                icon={<ShieldX />}
                hint="auto-actioned"
              />
            </div>
            <div className="animate-fade-up" style={{ animationDelay: "80ms" }}>
              <StatTile
                label="In review"
                value={data.pendingQueue}
                accent="var(--color-warning)"
                icon={<ShieldAlert />}
                hint="awaiting humans"
              />
            </div>
            <div
              className="animate-fade-up"
              style={{ animationDelay: "120ms" }}
            >
              <StatTile
                label="Agreement"
                value={
                  data.agreement.rate === null ? "—" : pct(data.agreement.rate)
                }
                accent="var(--color-success)"
                icon={<ThumbsUp />}
                hint={`${data.agreement.agreed}/${data.agreement.reviewed} reviewed`}
              />
            </div>
            <div
              className="animate-fade-up"
              style={{ animationDelay: "160ms" }}
            >
              <StatTile
                label="Avg latency"
                value={`${Math.round(data.averages.latencyMs)}ms`}
                icon={<Timer />}
                hint="per classification"
              />
            </div>
            <div
              className="animate-fade-up"
              style={{ animationDelay: "200ms" }}
            >
              <StatTile
                label="Avg confidence"
                value={pct(data.averages.confidence)}
                accent="var(--color-info)"
                icon={<Activity />}
                hint="top-category"
              />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="animate-fade-up p-5">
              <SectionTitle
                title="Routing outcomes"
                subtitle="How content is being actioned"
              />
              <div className="mt-4 flex items-center gap-5">
                <div className="relative h-[170px] w-[170px] shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={actionData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={50}
                        outerRadius={78}
                        paddingAngle={2}
                        stroke="none"
                      >
                        {actionData.map((d) => (
                          <Cell key={d.name} fill={ACTION_COLORS[d.name]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={tooltipStyle}
                        itemStyle={{ color: "#e7eef8" }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-semibold tabular">
                      {data.total}
                    </span>
                    <span className="text-[10px] uppercase tracking-wide text-faint">
                      total
                    </span>
                  </div>
                </div>
                <div className="flex-1 space-y-2">
                  {(["BLOCK", "REVIEW", "ALLOW"] as const).map((a) => (
                    <div key={a} className="flex items-center gap-2 text-sm">
                      <ActionBadge action={a} size="sm" />
                      <span className="ml-auto tabular font-medium">
                        {data.actionCounts[a] ?? 0}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            <Card className="animate-fade-up p-5 lg:col-span-2">
              <SectionTitle
                title="Harm categories flagged"
                subtitle="Top category across blocked & reviewed content"
              />
              <div className="mt-4">
                {categoryData.length === 0 ? (
                  <EmptyState title="No flagged content" />
                ) : (
                  <ResponsiveContainer
                    width="100%"
                    height={Math.max(180, categoryData.length * 36)}
                  >
                    <BarChart
                      data={categoryData}
                      layout="vertical"
                      margin={{ left: 8, right: 16 }}
                    >
                      <XAxis
                        type="number"
                        tick={{ fill: "#93a1b5", fontSize: 11 }}
                        axisLine={{ stroke: "#232d3f" }}
                        tickLine={false}
                        allowDecimals={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="label"
                        width={120}
                        tick={{ fill: "#93a1b5", fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        cursor={{ fill: "rgba(255,255,255,0.03)" }}
                        contentStyle={tooltipStyle}
                        itemStyle={{ color: "#e7eef8" }}
                      />
                      <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={18}>
                        {categoryData.map((d) => (
                          <Cell key={d.category} fill={d.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="animate-fade-up p-5">
              <SectionTitle title="By platform" subtitle="Decision volume" />
              <div className="mt-4 space-y-3">
                {data.byPlatform.map((p) => {
                  const max = Math.max(
                    1,
                    ...data.byPlatform.map((x) => x.count),
                  );
                  return (
                    <div key={p.id}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ background: p.accentColor }}
                          />
                          {p.name}
                          <span className="text-xs text-faint">
                            {p.audience}
                          </span>
                        </span>
                        <span className="tabular font-medium">{p.count}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-elevated">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${(p.count / max) * 100}%`,
                            background: p.accentColor,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-5 border-t border-border pt-4">
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-faint">
                  Engine mix
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  {(["gemini", "groq", "local"] as const)
                    .filter(
                      (e) =>
                        (data.engineCounts[e] ?? 0) > 0 || engineTotal === 0,
                    )
                    .map((e) => (
                      <span key={e} className="flex items-center gap-1.5">
                        <EngineBadge engine={e} />
                        <span className="tabular text-sm">
                          {data.engineCounts[e] ?? 0}
                        </span>
                      </span>
                    ))}
                  <span className="ml-auto text-xs text-faint">
                    {engineTotal} total
                  </span>
                </div>
              </div>
            </Card>

            <Card className="animate-fade-up p-5 lg:col-span-2">
              <SectionTitle
                title="Recent activity"
                subtitle="Latest pipeline decisions"
                action={
                  <Link
                    href="/decisions"
                    className="flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    View all <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                }
              />
              <div className="mt-3 divide-y divide-border">
                {data.recent.map((r) => (
                  <Link
                    key={r.id}
                    href={`/decisions?focus=${r.id}`}
                    className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-elevated/50"
                  >
                    <ActionBadge action={r.action} size="sm" />
                    <span
                      className="hidden h-2 w-2 shrink-0 rounded-full sm:block"
                      style={{ background: r.accentColor }}
                      title={r.platform}
                    />
                    {r.topCategory && (
                      <span className="hidden md:block">
                        <CategoryChip category={r.topCategory} />
                      </span>
                    )}
                    <span className="flex-1 truncate text-sm text-muted">
                      {r.text}
                    </span>
                    <span className="tabular hidden text-xs text-faint sm:block">
                      {pct(r.confidence)}
                    </span>
                    <span className="w-16 shrink-0 text-right text-xs text-faint">
                      {timeAgo(r.createdAt)}
                    </span>
                  </Link>
                ))}
              </div>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-64" />
        <Skeleton className="h-64 lg:col-span-2" />
      </div>
    </div>
  );
}
