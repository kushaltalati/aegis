# 📖 How to Use Aegis

A practical walkthrough of what Aegis does and how to drive it. For architecture
and API details see [`README.md`](./README.md).

---

## 1. What it is (in one minute)

Aegis is a **content moderation pipeline**. You give it a piece of content and a
platform, and it:

1. **Classifies** the content across 7 harm categories (hate speech, harassment,
   spam, misinformation, graphic violence, adult content, self-harm), each with a
   confidence score from 0–100%.
2. **Routes** it based on confidence and the platform's policy:
   - very confident it's harmful → **BLOCK** (automatic)
   - unsure / borderline → **REVIEW** (sent to a human queue)
   - looks fine → **ALLOW**
3. **Explains** every decision: which exact words triggered it, which category,
   the reasoning, and a step-by-step routing trace — all stored for audit.
4. Lets **humans review** the borderline cases and overrule the AI; their verdict
   is recorded as feedback.
5. Lets each **platform configure its own policy** — thresholds, which categories
   it cares about, signal weights, and custom regex rules.

The key idea: **the same sentence can be handled differently depending on
context** — the platform, the author's history, and the conversation around it.

---

## 2. Run it

```bash
cd ~/aegis
npm install          # first time only
npm run db:reset     # creates the database + loads demo data (safe to re-run)
npm run dev          # then open http://localhost:3000
```

That's it — it works with **no API key** (a built-in local engine powers
everything). To turn on smarter AI classification, see the next section.

---

## 3. The AI engines (fallback chain)

Aegis classifies through a **fallback chain** — if one engine fails (rate limit,
outage, no key), it automatically tries the next, so moderation never breaks:

```
Gemini  →  Groq  →  local engine (last resort)
```

| Engine | Key (in `.env`) | Notes |
|---|---|---|
| **Gemini** (Google) | `GEMINI_API_KEY` | Primary. Free tier; key looks like `AIza…`. |
| **Groq** (free) | `FALLBACK_LLM_API_KEY` | Fast, free fallback when Gemini is busy. OpenAI-compatible — can also point at OpenAI/Together/etc. |
| **Local engine** | none | Always available. Deterministic keyword scorer; only used if **no** AI engine is reachable. |

Get the free keys:
- **Gemini** → <https://aistudio.google.com/apikey> → `GEMINI_API_KEY="AIza…"`
- **Groq** → <https://console.groq.com/keys> → `FALLBACK_LLM_API_KEY="gsk_…"`

Then **restart** `npm run dev`. The left sidebar shows the active engine
("Gemini · live", "Groq · live", or "Local engine · fallback"), and every
decision's reasoning notes if it fell back (e.g. `[gemini unavailable — groq
fallback]`), so it stays fully auditable.

> Runs with **no keys at all** too — it just uses the local engine, which is
> keyword-based and misses nuance. Add at least one AI key for real classification.

---

## 4. Guided tour — try these

### 🧪 Test Console (`/console`) — the best place to start
This is where you submit content and watch the pipeline work.

**Try the explainability:**
1. Click a labelled sample chip (e.g. **Hate Speech**) — it fills the box.
2. Hit **Run pipeline**.
3. On the right you'll see the action (ALLOW/REVIEW/BLOCK), the **offending words
   highlighted**, the AI's reasoning, the **routing trace**, the per-category
   confidence bars, and the context used.

**Try context-sensitivity (the headline feature):** the chips marked with a **⇄**
icon are pairs of *almost identical* text that should be treated differently.
- Load the **⇄ Harassment** chip ("I know where you live. I'm going to kill you.")
  on **KidSpace** → it **BLOCKS**.
- Load the **⇄ benign** chip ("Haha I'm going to kill you, your base is mine…") —
  it's banter on **PlayZone** → it's **ALLOWED**.
- Same surface phrase, opposite outcome, because of platform + thread context.

**Try author history:** pick an author from the dropdown. A low-trust
"repeat_offender" escalates borderline content; a "trusted_vet" doesn't. Watch the
routing trace show the escalation multiplier.

**Batch evaluation tab:** pick a platform and click **Run evaluation** to score the
whole labelled test set and see an accuracy number + per-sample expected-vs-got.

### 📊 Dashboard (`/`)
The operations overview: total decisions, how many were blocked vs reviewed vs
allowed (donut), which harm categories show up most, volume per platform, the
human/AI agreement rate, and a live feed of recent decisions (click any row to
open its full detail).

### 📥 Review Queue (`/queue`)
The human side. Borderline cases land here, sorted by priority (URGENT → LOW).
1. Click an item to see the full explainable decision + context.
2. In **Make a decision**, type your name and click **Allow** or **Block** (add
   notes if you like).
3. The system records whether you **agreed with or overruled** the AI — that's the
   feedback signal, visible on the Dashboard's agreement rate.

### 📜 Decision Log (`/decisions`)
Every decision ever made, searchable and filterable by platform, action, and
category. Click any row to open a detail panel with the full explanation **and an
audit trail** (who/what did what, when).

### ⚙️ Platform Policies (`/platforms`) — the tuning knobs
Pick a platform on the left and edit its policy on the right:
- **Engine** (auto / Gemini / local)
- **Review & auto-block thresholds** (drag the sliders; the colored bar shows the
  ALLOW/REVIEW/BLOCK zones)
- **Harm categories** — toggle each on/off, change its **weight**, or set
  per-category threshold **overrides**
- **Custom rules** — regex patterns that force ALLOW/REVIEW/BLOCK
- Click **Save changes**, then **Run test set** under *Test impact* to see how your
  changes shifted the outcomes.

**Try the tunability demo:** run the test set on **KidSpace** (strict, for kids)
vs **OpenForum** (lenient, adults). Same content, very different blocking — purely
from policy. On KidSpace almost everything is blocked; on OpenForum adult content
is allowed and more goes to human review.

---

## 5. The 4 demo platforms

| Platform | For | Behavior |
|---|---|---|
| **KidSpace** | children | Very strict; all categories on; blocks aggressively. |
| **SocialHub** | general | Balanced, industry-standard thresholds. |
| **OpenForum** | adults | Adult content allowed; only severe content blocked. |
| **PlayZone** | teen gamers | Tolerates competitive banter; strict on real threats. |

---

## 6. How a decision is made (the flow)

```
content + platform
  → engine scores every category (0–100%)
  → disabled categories dropped; remaining scaled by their weight
  → author's low trust nudges borderline scores up
  → custom regex rules can force an action
  → score vs thresholds decides ALLOW / REVIEW / BLOCK
  → saved with full reasoning + audit log; REVIEW items enter the queue
```

Every number in that chain comes from the **platform's saved policy** — nothing is
hardcoded, so changing a slider genuinely changes behavior.

---

## 7. Troubleshooting

- **Sidebar says "Local engine" but I added a key** → restart `npm run dev` (env is
  read once at startup).
- **Reasoning says "AI engines unavailable — local fallback"** → no AI key is
  reachable. Add a Gemini (`AIza…`) or Groq (`gsk_…`) key and restart. Aegis keeps
  working on the local engine meanwhile.
- **Decisions show "Groq" not "Gemini"** → that's the fallback working: Gemini was
  rate-limited, so Groq handled it. Both are real AI.
- **Want to reset / re-classify the demo data** → `npm run db:reset` (re-runs every
  item through the current AI chain).
- **Port 3000 in use** → `PORT=3001 npm run dev`.
