// Seed: four platforms with distinct policies, authors with varied histories,
// and a populated set of moderation decisions (run through the real pipeline,
// so the local engine produces deterministic, realistic data with no API key).

import { PrismaClient } from "@prisma/client";
import { defaultCategoryConfig, serializePolicyForDb } from "../src/lib/policy";
import { moderateContent, resolveReview } from "../src/lib/moderate";
import { SAMPLES } from "../src/lib/samples";
import type { HarmCategory } from "../src/lib/categories";
import type { PolicySnapshot, CustomRule } from "../src/lib/types";

const prisma = new PrismaClient();

function policy(
  overrides: Partial<PolicySnapshot> & {
    categoryOverrides?: Partial<
      Record<HarmCategory, { enabled?: boolean; weight?: number; blockThreshold?: number; reviewThreshold?: number }>
    >;
  },
): ReturnType<typeof serializePolicyForDb> {
  const categoryConfig = defaultCategoryConfig();
  for (const [cat, ov] of Object.entries(overrides.categoryOverrides ?? {})) {
    categoryConfig[cat as HarmCategory] = {
      ...categoryConfig[cat as HarmCategory],
      ...ov,
    };
  }
  const snapshot: PolicySnapshot = {
    engine: overrides.engine ?? "auto",
    autoBlockThreshold: overrides.autoBlockThreshold ?? 0.85,
    reviewThreshold: overrides.reviewThreshold ?? 0.45,
    historyWeight: overrides.historyWeight ?? 0.15,
    categoryConfig,
    customRules: overrides.customRules ?? [],
  };
  return serializePolicyForDb(snapshot);
}

const rule = (
  id: string,
  name: string,
  description: string,
  pattern: string,
  category: HarmCategory,
  action: CustomRule["action"],
): CustomRule => ({ id, name, description, pattern, category, action, enabled: true });

async function main() {
  console.log("Resetting database…");
  await prisma.auditLog.deleteMany();
  await prisma.reviewerFeedback.deleteMany();
  await prisma.reviewQueueItem.deleteMany();
  await prisma.categoryScore.deleteMany();
  await prisma.moderationDecision.deleteMany();
  await prisma.contentItem.deleteMany();
  await prisma.policyConfig.deleteMany();
  await prisma.platform.deleteMany();
  await prisma.authorProfile.deleteMany();

  console.log("Creating platforms…");

  const kidspace = await prisma.platform.create({
    data: {
      slug: "kidspace",
      name: "KidSpace",
      description:
        "A learning community for under-13s. Zero-tolerance, conservative thresholds, all categories on.",
      audience: "children",
      accentColor: "#a855f7",
      policy: {
        create: policy({
          autoBlockThreshold: 0.7,
          reviewThreshold: 0.25,
          historyWeight: 0.25,
          categoryOverrides: {
            adult_content: { weight: 1.5, blockThreshold: 0.4, reviewThreshold: 0.15 },
            graphic_violence: { blockThreshold: 0.55, reviewThreshold: 0.2 },
            self_harm: { blockThreshold: 0.5, reviewThreshold: 0.15 },
            harassment: { reviewThreshold: 0.2 },
          },
          customRules: [
            rule(
              "kid-pii",
              "Personal info solicitation",
              "Flags attempts to extract a child's address or school.",
              "(what school|where do you live|your address|send.*photo)",
              "harassment",
              "REVIEW",
            ),
          ],
        }),
      },
    },
  });

  const socialhub = await prisma.platform.create({
    data: {
      slug: "socialhub",
      name: "SocialHub",
      description:
        "General-purpose social network. Balanced, industry-standard thresholds.",
      audience: "general",
      accentColor: "#3b82f6",
      policy: {
        create: policy({
          autoBlockThreshold: 0.85,
          reviewThreshold: 0.45,
          historyWeight: 0.15,
        }),
      },
    },
  });

  const openforum = await prisma.platform.create({
    data: {
      slug: "openforum",
      name: "OpenForum",
      description:
        "Adults-only discussion site. Adult content permitted; only the most severe categories are blocked.",
      audience: "adult",
      accentColor: "#f59e0b",
      policy: {
        create: policy({
          autoBlockThreshold: 0.92,
          reviewThreshold: 0.6,
          historyWeight: 0.1,
          categoryOverrides: {
            adult_content: { enabled: false },
            graphic_violence: { blockThreshold: 0.95, reviewThreshold: 0.75 },
            spam: { reviewThreshold: 0.7 },
          },
        }),
      },
    },
  });

  const playzone = await prisma.platform.create({
    data: {
      slug: "playzone",
      name: "PlayZone",
      description:
        "Teen gaming community. Tolerant of competitive banter, strict on real harassment and threats.",
      audience: "teen",
      accentColor: "#22c55e",
      policy: {
        create: policy({
          autoBlockThreshold: 0.88,
          reviewThreshold: 0.5,
          historyWeight: 0.2,
          categoryOverrides: {
            harassment: { reviewThreshold: 0.55 },
            adult_content: { weight: 1.2 },
          },
          customRules: [
            rule(
              "pz-banter",
              "GG banter allowlist",
              "Treats friendly post-match banter as benign.",
              "\\b(gg|good game|rematch|nice match)\\b",
              "harassment",
              "ALLOW",
            ),
          ],
        }),
      },
    },
  });

  const platformBySlug: Record<string, string> = {
    kidspace: kidspace.id,
    socialhub: socialhub.id,
    openforum: openforum.id,
    playzone: playzone.id,
  };

  console.log("Creating authors…");
  const authors = await Promise.all([
    prisma.authorProfile.create({
      data: { handle: "trusted_vet", displayName: "Maria (Verified)", trustScore: 0.95, priorViolations: 0, accountAgeDays: 1240 },
    }),
    prisma.authorProfile.create({
      data: { handle: "regular_jane", displayName: "Jane D.", trustScore: 0.6, priorViolations: 0, accountAgeDays: 210 },
    }),
    prisma.authorProfile.create({
      data: { handle: "fresh_account", displayName: "newuser_8842", trustScore: 0.22, priorViolations: 0, accountAgeDays: 2 },
    }),
    prisma.authorProfile.create({
      data: { handle: "repeat_offender", displayName: "x_troll_x", trustScore: 0.1, priorViolations: 4, accountAgeDays: 95 },
    }),
  ]);
  const authorByHandle: Record<string, string> = Object.fromEntries(
    authors.map((a) => [a.handle, a.id]),
  );

  console.log("Running pipeline over labelled test set…");
  // Map each labelled sample onto a platform + an author to create realistic data.
  const sampleAuthor: Record<string, string> = {
    "hate-1": "repeat_offender",
    "harass-1": "repeat_offender",
    "spam-1": "fresh_account",
    "misinfo-1": "fresh_account",
    "violence-1": "repeat_offender",
    "adult-1": "fresh_account",
    "selfharm-1": "regular_jane",
    "benign-1": "trusted_vet",
    "benign-2": "trusted_vet",
    "ctx-a-game": "regular_jane",
    "ctx-a-threat": "repeat_offender",
    "ctx-b-support": "trusted_vet",
    "ctx-b-active": "fresh_account",
  };

  for (const sample of SAMPLES) {
    const platformId =
      platformBySlug[sample.suggestPlatform ?? "socialhub"] ?? socialhub.id;
    await moderateContent({
      platformId,
      text: sample.text,
      authorId: authorByHandle[sampleAuthor[sample.id] ?? "regular_jane"],
      thread: sample.thread,
      label: sample.expected,
    });
  }

  // Extra volume so the dashboard looks alive.
  const extra: { text: string; slug: string; handle: string; label: HarmCategory | "benign" }[] = [
    { text: "Win a free iPhone! Click here now, limited offer, act now!!!", slug: "socialhub", handle: "fresh_account", label: "spam" },
    { text: "Those people are inferior race and don't belong here.", slug: "socialhub", handle: "repeat_offender", label: "hate_speech" },
    { text: "Loving the new patch notes, the balance changes feel great.", slug: "playzone", handle: "regular_jane", label: "benign" },
    { text: "The election was stolen and 5g causes the virus, wake up sheeple.", slug: "socialhub", handle: "fresh_account", label: "misinformation" },
    { text: "Thanks everyone for the birthday wishes, you all made my day!", slug: "socialhub", handle: "trusted_vet", label: "benign" },
    { text: "You are pathetic and nobody likes you, just shut up already.", slug: "playzone", handle: "repeat_offender", label: "harassment" },
    { text: "Great tutorial on photosynthesis, my kid finally gets it!", slug: "kidspace", handle: "trusted_vet", label: "benign" },
    { text: "Check my onlyfans for nsfw nude content xxx", slug: "openforum", handle: "regular_jane", label: "adult_content" },
    // Borderline cases engineered to land in the REVIEW band (ambiguous routing).
    { text: "You are pathetic, honestly nobody likes you anyway.", slug: "socialhub", handle: "trusted_vet", label: "harassment" },
    { text: "Limited offer, act now — guaranteed results inside.", slug: "socialhub", handle: "trusted_vet", label: "spam" },
    { text: "Honestly that miracle cure stuff sounds like a proven hoax to me.", slug: "socialhub", handle: "regular_jane", label: "misinformation" },
  ];
  for (const e of extra) {
    await moderateContent({
      platformId: platformBySlug[e.slug],
      text: e.text,
      authorId: authorByHandle[e.handle],
      label: e.label,
    });
  }

  console.log("Seeding a few resolved reviews (reviewer feedback)…");
  const reviewItems = await prisma.reviewQueueItem.findMany({
    where: { status: "PENDING" },
    include: { decision: true },
    take: 3,
  });
  if (reviewItems[0]) {
    await resolveReview({
      decisionId: reviewItems[0].decisionId,
      reviewer: "alex.chen",
      finalAction: "BLOCK",
      notes: "Confirmed violation — agrees with AI assessment.",
    });
  }
  if (reviewItems[1]) {
    await resolveReview({
      decisionId: reviewItems[1].decisionId,
      reviewer: "sam.patel",
      finalAction: "ALLOW",
      notes: "False positive in context — overriding to allow.",
    });
  }

  const counts = {
    platforms: await prisma.platform.count(),
    authors: await prisma.authorProfile.count(),
    decisions: await prisma.moderationDecision.count(),
    pendingReviews: await prisma.reviewQueueItem.count({ where: { status: "PENDING" } }),
  };
  console.log("Seed complete:", counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
