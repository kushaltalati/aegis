"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FlaskConical,
  Inbox,
  ScrollText,
  SlidersHorizontal,
  ShieldCheck,
  Bot,
  Cpu,
  Menu,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: LucideIcon };

const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/console", label: "Test Console", icon: FlaskConical },
  { href: "/queue", label: "Review Queue", icon: Inbox },
  { href: "/decisions", label: "Decisions", icon: ScrollText },
  { href: "/platforms", label: "Platforms", icon: SlidersHorizontal },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState<number | null>(null);
  const [engine, setEngine] = React.useState<
    "gemini" | "groq" | "local" | null
  >(null);

  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lightweight status poll for the queue badge + engine indicator.
  React.useEffect(() => {
    let active = true;
    const load = () =>
      fetch("/api/analytics")
        .then((r) => r.json())
        .then((d) => {
          if (!active) return;
          setPending(d.pendingQueue ?? 0);
          setEngine(
            d.geminiAvailable ? "gemini" : d.groqAvailable ? "groq" : "local",
          );
        })
        .catch(() => {});
    load();
    const t = setInterval(load, 15000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [pathname]);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const SidebarContent = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 pb-6 pt-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 ring-1 ring-primary/30">
          <ShieldCheck className="h-5 w-5 text-primary" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold tracking-tight text-foreground">
            Aegis
          </div>
          <div className="text-[11px] text-faint">Moderation Pipeline</div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {NAV.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-primary/12 text-foreground"
                  : "text-muted hover:bg-elevated hover:text-foreground",
              )}
            >
              <Icon
                className={cn(
                  "h-[18px] w-[18px] transition-colors",
                  active ? "text-primary" : "text-faint group-hover:text-muted",
                )}
              />
              <span>{item.label}</span>
              {item.href === "/queue" && pending ? (
                <span className="ml-auto rounded-full bg-warning/20 px-1.5 py-0.5 text-[11px] font-semibold text-warning tabular">
                  {pending}
                </span>
              ) : null}
              {active && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="m-3 rounded-xl border border-border bg-surface p-3">
        <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-faint">
          Active engine
        </div>
        <div className="flex items-center gap-2">
          {engine === "gemini" || engine === "groq" ? (
            <>
              <Bot className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-foreground">
                {engine === "gemini" ? "Gemini" : "Groq"}
              </span>
              <span className="ml-auto flex items-center gap-1 text-[11px] text-success">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
                live
              </span>
            </>
          ) : (
            <>
              <Cpu className="h-4 w-4 text-muted" />
              <span className="text-sm font-medium text-foreground">
                Local engine
              </span>
              <span className="ml-auto text-[11px] text-faint">fallback</span>
            </>
          )}
        </div>
        {engine === "local" && (
          <p className="mt-1.5 text-[11px] leading-snug text-faint">
            Set GEMINI_API_KEY or FALLBACK_LLM_API_KEY to enable AI
            classification.
          </p>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-border bg-surface/60 backdrop-blur-sm lg:block">
        {SidebarContent}
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-surface/80 px-4 py-3 backdrop-blur-md lg:hidden">
        <button
          aria-label="Open navigation"
          onClick={() => setOpen(true)}
          className="rounded-lg border border-border bg-elevated p-2 text-muted"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <span className="font-semibold">Aegis</span>
        </div>
      </header>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-64 border-r border-border bg-surface">
            <button
              aria-label="Close navigation"
              onClick={() => setOpen(false)}
              className="absolute right-3 top-3 rounded-lg p-1.5 text-muted hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
            {SidebarContent}
          </div>
        </div>
      )}

      <main className="lg:pl-64">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
