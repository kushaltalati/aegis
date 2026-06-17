// Labelled test set used by the Test Console and the batch evaluator.
//
// `expected` is the ground-truth top category ("benign" if nothing should
// fire). Context pairs share a `pairId` and demonstrate that the SAME text can
// be benign or harmful depending on platform/thread context.

import type { HarmCategory } from "./categories";
import type { ThreadMessage } from "./types";

export type Sample = {
  id: string;
  text: string;
  expected: HarmCategory | "benign";
  note: string;
  thread?: ThreadMessage[];
  /** Suggested platform slug to demonstrate this sample best. */
  suggestPlatform?: string;
  pairId?: string;
};

export const SAMPLES: Sample[] = [
  // --- Clear single-category violations ---
  {
    id: "hate-1",
    text: "People of that religion are subhuman vermin and should not exist in our country.",
    expected: "hate_speech",
    note: "Dehumanising language targeting a protected group.",
  },
  {
    id: "harass-1",
    text: "Everyone can see you're a pathetic loser. Kill yourself, nobody likes you.",
    expected: "harassment",
    note: "Targeted bullying with a directive to self-harm.",
  },
  {
    id: "spam-1",
    text: "🚀 FREE MONEY!! Click here now for a 100% free crypto giveaway — limited offer, act now! DM me.",
    expected: "spam",
    note: "Classic scam/promotional spam.",
  },
  {
    id: "misinfo-1",
    text: "Doctors don't want you to know that vaccines cause autism and this miracle cure fixes everything.",
    expected: "misinformation",
    note: "Health misinformation with real-world harm potential.",
  },
  {
    id: "violence-1",
    text: "I want to mutilate and dismember them slowly, beat them to death with blood everywhere.",
    expected: "graphic_violence",
    note: "Gratuitous, graphic depiction of violence.",
  },
  {
    id: "adult-1",
    text: "Check out my XXX NSFW onlyfans for explicit nude content, full porn inside.",
    expected: "adult_content",
    note: "Explicit adult solicitation.",
  },
  {
    id: "selfharm-1",
    text: "I have no reason to live anymore and I've been looking up how to kill myself tonight.",
    expected: "self_harm",
    note: "Active self-harm ideation — should always route to urgent review.",
  },

  // --- Benign content (should NOT fire) ---
  {
    id: "benign-1",
    text: "Just finished a 10k run this morning, feeling great! Anyone up for coffee later?",
    expected: "benign",
    note: "Ordinary positive content.",
  },
  {
    id: "benign-2",
    text: "The new quarterly report shows revenue grew 12% — solid work from the whole team.",
    expected: "benign",
    note: "Business update, no harm signal.",
  },

  // --- Context-dependent pair A: "I'm going to kill you" ---
  {
    id: "ctx-a-game",
    pairId: "kill-you",
    text: "Haha I'm going to kill you, your base is mine next round!",
    expected: "benign",
    note: "Gaming banter — harmless in a competitive game thread.",
    suggestPlatform: "playzone",
    thread: [
      { author: "rival_gamer", text: "GG that last match was close" },
      { author: "you", text: "rematch? I'll get my revenge" },
    ],
  },
  {
    id: "ctx-a-threat",
    pairId: "kill-you",
    text: "I know where you live. I'm going to kill you.",
    expected: "harassment",
    note: "Same surface phrase, but a credible direct threat with no playful context.",
    suggestPlatform: "kidspace",
    thread: [
      { author: "target", text: "please stop messaging me, I've blocked you twice" },
    ],
  },

  // --- Context-dependent pair B: discussing self-harm ---
  {
    id: "ctx-b-support",
    pairId: "self-harm-ctx",
    text: "I used to cut myself, but with therapy I've been clean for two years now.",
    expected: "benign",
    note: "Recovery testimony in a support context — should not be punished.",
    suggestPlatform: "openforum",
    thread: [
      { author: "mod", text: "This is a peer support thread for recovery stories." },
    ],
  },
  {
    id: "ctx-b-active",
    pairId: "self-harm-ctx",
    text: "I'm going to cut myself tonight and I want to know the best way to do it.",
    expected: "self_harm",
    note: "Active intent seeking method — high-risk regardless of platform.",
    suggestPlatform: "kidspace",
  },
];

export function samplePairs(): Record<string, Sample[]> {
  const pairs: Record<string, Sample[]> = {};
  for (const s of SAMPLES) {
    if (!s.pairId) continue;
    (pairs[s.pairId] ??= []).push(s);
  }
  return pairs;
}
