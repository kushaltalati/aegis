import { ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { parsePolicy, enabledCategories } from "@/lib/policy";

export async function GET() {
  const platforms = await prisma.platform.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      policy: true,
      _count: { select: { decisions: true } },
    },
  });

  const data = platforms.map((p) => {
    const policy = p.policy ? parsePolicy(p.policy) : null;
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      description: p.description,
      audience: p.audience,
      accentColor: p.accentColor,
      decisionCount: p._count.decisions,
      policy: policy
        ? {
            engine: policy.engine,
            autoBlockThreshold: policy.autoBlockThreshold,
            reviewThreshold: policy.reviewThreshold,
            historyWeight: policy.historyWeight,
            enabledCategories: enabledCategories(policy),
            customRuleCount: policy.customRules.length,
          }
        : null,
    };
  });

  return ok({ platforms: data });
}
