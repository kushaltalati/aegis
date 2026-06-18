# 🛡 Aegis — AI-Powered Content Moderation Pipeline

A multi-stage content moderation pipeline: automated classification, confidence-based
routing, a human review queue, fully explainable decisions, and per-platform policy
configuration. Built to scale trust & safety without scaling the moderation team linearly.

> Assignment #10 — Trust & Safety. Everything is config-driven; nothing about routing
> behaviour is hardcoded — thresholds, category toggles, weights and custom rules all
> live in each platform's policy in the database.

## ✨ Features

| Requirement | How Aegis delivers it |
|---|---|
| **Multi-category classification** | 7 harm categories (hate speech, harassment, spam, misinformation, graphic violence, adult content, self-harm) each with a 0–1 confidence score. |
| **Context-aware analysis** | The engine receives the platform, the author's trust/history, and the conversation thread. The same phrase routes differently per context (see the context pairs in the Test Console). |
| **Confidence-based routing** | High confidence → auto-block; mid-band → human review queue; low → allow. Thresholds are per-platform and per-category. |
| **Explainable decisions** | Every decision shows the exact offending text span, the harm category, the model's reasoning, and a step-by-step routing trace — all auditable. |
| **Human review queue** | Priority-sorted queue; reviewers see the AI decision + full context and make the final call. Their verdict is recorded as agreement/override feedback. |
| **Policy configuration** | Per-platform engine choice, global + per-category thresholds, category toggles, signal weights, and regex custom rules. A "Test impact" tool re-runs the labelled set against any policy. |

## 🏗 Architecture

```
content + platform
   └─▶ Engine (Gemini ─or─ local fallback)        src/lib/engine/*
          → per-category confidence + offending spans + reasoning
   └─▶ Policy application                          src/lib/pipeline.ts
          → category toggles, weights, history escalation, custom rules
   └─▶ Confidence-based routing                    → ALLOW | REVIEW | BLOCK
   └─▶ Persistence + audit log                     src/lib/moderate.ts
```

- **Engine interface** (`src/lib/types.ts` → `ModerationEngine`) with two implementations:
  - `GeminiEngine` — Google Gemini via REST, structured JSON output, context-aware prompt.
  - `LocalEngine` — deterministic weighted-lexicon scorer; always available, zero-config.
  - `EngineRouter` picks per the global env + platform policy and **falls back to local** if Gemini is unconfigured or errors.
- **Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · Prisma + SQLite · Recharts.

## 🚀 Getting started

```bash
npm install
cp .env.example .env        # optional: add GEMINI_API_KEY for AI classification
npm run db:reset            # create the SQLite schema + seed platforms, authors, test data
npm run dev                 # http://localhost:3000
```

No Gemini key? It just works — the deterministic local engine powers everything (the
sidebar shows the active engine). Add a key to `.env` and restart to switch on Gemini.

### Scripts
- `npm run db:push` — sync schema to SQLite
- `npm run db:seed` — seed/refresh data
- `npm run db:reset` — wipe + reseed
- `npm run build` — production build (type-checked)

## 🗺 Pages
- **/** Dashboard — routing outcomes, category distribution, throughput, agreement rate, live feed.
- **/console** Test Console — classify any content with chosen platform/author/thread and see the explainable result; plus batch-evaluate the labelled test set for accuracy.
- **/queue** Review Queue — priority-sorted human review with the full explainable decision and Allow/Block + notes.
- **/decisions** Decision Log — searchable/filterable audit trail with a per-decision detail + audit timeline.
- **/platforms** Platform Policies — the policy editor (engine, thresholds, category toggles/weights/overrides, custom rules, test impact).

## 🌱 Seeded platforms (illustrate tunability)
| Platform | Audience | Policy |
|---|---|---|
| **KidSpace** | children | Conservative thresholds, all categories on, adult content weighted up, PII custom rule. |
| **SocialHub** | general | Balanced, industry-standard thresholds. |
| **OpenForum** | adult | Adult content disabled, only severe categories blocked. |
| **PlayZone** | teen | Tolerant of banter (GG allowlist rule), strict on real threats. |

Run the same labelled test set on KidSpace vs OpenForum from the Test Console to watch the
routing distribution change purely from policy.

## 📡 API
`POST /api/moderate` · `GET/PATCH /api/platforms[/:id][/policy]` · `GET /api/queue` ·
`POST /api/queue/:id/resolve` · `GET /api/decisions[/:id]` · `GET /api/analytics` ·
`GET /api/audit` · `GET /api/authors` · `GET /api/samples` · `POST /api/evaluate`
