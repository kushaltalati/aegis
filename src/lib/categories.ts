// Canonical harm-category taxonomy for Aegis.
//
// This file is the single source of truth for *what* categories exist and the
// data the local fallback engine scores against. It is data, not policy:
// whether a category is enabled, its weight, and the thresholds that route a
// decision all live in each platform's PolicyConfig (database) — never here.

export const HARM_CATEGORIES = [
  "hate_speech",
  "harassment",
  "spam",
  "misinformation",
  "graphic_violence",
  "adult_content",
  "self_harm",
] as const;

export type HarmCategory = (typeof HARM_CATEGORIES)[number];

export type CategoryMeta = {
  id: HarmCategory;
  label: string;
  description: string;
  /** Intrinsic severity of the category (0..1) — how damaging a confirmed case is. */
  baseSeverity: number;
  /** Tailwind-friendly hex used for chips/charts. */
  color: string;
  /** lucide-react icon name. */
  icon: string;
};

export const CATEGORY_META: Record<HarmCategory, CategoryMeta> = {
  hate_speech: {
    id: "hate_speech",
    label: "Hate Speech",
    description:
      "Attacks or dehumanises people based on protected attributes (race, religion, gender, orientation, disability).",
    baseSeverity: 0.9,
    color: "#ef4444",
    icon: "Flame",
  },
  harassment: {
    id: "harassment",
    label: "Harassment",
    description:
      "Targeted bullying, threats, intimidation, or repeated unwanted contact directed at an individual.",
    baseSeverity: 0.8,
    color: "#f97316",
    icon: "Swords",
  },
  spam: {
    id: "spam",
    label: "Spam",
    description:
      "Unsolicited bulk promotion, scams, deceptive links, or repetitive low-value content.",
    baseSeverity: 0.35,
    color: "#eab308",
    icon: "Megaphone",
  },
  misinformation: {
    id: "misinformation",
    label: "Misinformation",
    description:
      "Verifiably false or misleading claims that can cause real-world harm (health, elections, safety).",
    baseSeverity: 0.6,
    color: "#a855f7",
    icon: "AlertTriangle",
  },
  graphic_violence: {
    id: "graphic_violence",
    label: "Graphic Violence",
    description:
      "Gory, gratuitous depictions or glorification of violence, gore, or cruelty.",
    baseSeverity: 0.75,
    color: "#dc2626",
    icon: "Skull",
  },
  adult_content: {
    id: "adult_content",
    label: "Adult Content",
    description:
      "Sexually explicit or pornographic material. Acceptability is highly platform-dependent.",
    baseSeverity: 0.5,
    color: "#ec4899",
    icon: "EyeOff",
  },
  self_harm: {
    id: "self_harm",
    label: "Self-Harm",
    description:
      "Content that encourages, instructs, or glorifies suicide, self-injury, or eating disorders.",
    baseSeverity: 0.95,
    color: "#06b6d4",
    icon: "HeartCrack",
  },
};

export const CATEGORY_LIST: CategoryMeta[] = HARM_CATEGORIES.map(
  (c) => CATEGORY_META[c],
);

export function isHarmCategory(value: string): value is HarmCategory {
  return (HARM_CATEGORIES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Local-engine lexicon.
//
// Weighted signals the deterministic fallback engine uses when no LLM is
// available. Each term carries a weight (its contribution to the category's
// raw signal). `phrase: true` means the term is matched as a substring rather
// than a whole word. This is reference data the engine reads — adding terms
// here never requires touching engine logic.
// ---------------------------------------------------------------------------

export type LexiconTerm = { term: string; weight: number; phrase?: boolean };

export const CATEGORY_LEXICON: Record<HarmCategory, LexiconTerm[]> = {
  hate_speech: [
    { term: "subhuman", weight: 0.7 },
    { term: "vermin", weight: 0.5 },
    { term: "should not exist", weight: 0.6, phrase: true },
    { term: "go back to your country", weight: 0.7, phrase: true },
    { term: "inferior race", weight: 0.9, phrase: true },
    { term: "ethnic cleansing", weight: 0.95, phrase: true },
    { term: "those people", weight: 0.25, phrase: true },
    { term: "your kind", weight: 0.3, phrase: true },
  ],
  harassment: [
    { term: "kill yourself", weight: 0.95, phrase: true },
    { term: "kys", weight: 0.8 },
    { term: "i will find you", weight: 0.8, phrase: true },
    { term: "i know where you live", weight: 0.7, phrase: true },
    { term: "i'm going to kill you", weight: 0.45, phrase: true },
    { term: "going to kill you", weight: 0.4, phrase: true },
    { term: "watch your back", weight: 0.7, phrase: true },
    { term: "you are pathetic", weight: 0.4, phrase: true },
    { term: "loser", weight: 0.2 },
    { term: "nobody likes you", weight: 0.5, phrase: true },
    { term: "shut up", weight: 0.2, phrase: true },
  ],
  spam: [
    { term: "click here", weight: 0.5, phrase: true },
    { term: "free money", weight: 0.6, phrase: true },
    { term: "act now", weight: 0.4, phrase: true },
    { term: "limited offer", weight: 0.5, phrase: true },
    { term: "buy now", weight: 0.4, phrase: true },
    { term: "100% free", weight: 0.5, phrase: true },
    { term: "guaranteed", weight: 0.3 },
    { term: "crypto giveaway", weight: 0.7, phrase: true },
    { term: "dm me", weight: 0.3, phrase: true },
  ],
  misinformation: [
    { term: "vaccines cause", weight: 0.7, phrase: true },
    { term: "cure for cancer", weight: 0.6, phrase: true },
    { term: "the election was stolen", weight: 0.7, phrase: true },
    { term: "doctors don't want you to know", weight: 0.7, phrase: true },
    { term: "miracle cure", weight: 0.6, phrase: true },
    { term: "5g causes", weight: 0.7, phrase: true },
    { term: "proven hoax", weight: 0.5, phrase: true },
  ],
  graphic_violence: [
    { term: "decapitate", weight: 0.8 },
    { term: "blood everywhere", weight: 0.6, phrase: true },
    { term: "mutilate", weight: 0.8 },
    { term: "torture", weight: 0.6 },
    { term: "gore", weight: 0.5 },
    { term: "dismember", weight: 0.8 },
    { term: "beat them to death", weight: 0.85, phrase: true },
  ],
  adult_content: [
    { term: "explicit", weight: 0.3 },
    { term: "nsfw", weight: 0.5 },
    { term: "xxx", weight: 0.6 },
    { term: "porn", weight: 0.7 },
    { term: "nude", weight: 0.4 },
    { term: "onlyfans", weight: 0.5 },
  ],
  self_harm: [
    { term: "want to end my life", weight: 0.95, phrase: true },
    { term: "how to kill myself", weight: 0.97, phrase: true },
    { term: "cut myself", weight: 0.8, phrase: true },
    { term: "no reason to live", weight: 0.85, phrase: true },
    { term: "better off dead", weight: 0.85, phrase: true },
    { term: "starve myself", weight: 0.7, phrase: true },
  ],
};
