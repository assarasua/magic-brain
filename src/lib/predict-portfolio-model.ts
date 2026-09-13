import type { LatestSetWatchPick } from "@/lib/latest-set-watch";

export type PredictPortfolioRisk =
  | "preservation"
  | "conservative"
  | "balanced"
  | "growth"
  | "aggressive";

export type PredictPortfolioPosition = {
  card: LatestSetWatchPick["card"];
  quantity: number;
  unitPrice: number;
  allocation: number;
  portfolioWeight: number;
  modelScore: number;
  signal: {
    risk: LatestSetWatchPick["score"]["risk"];
    confidence: LatestSetWatchPick["score"]["confidence"];
    trend: LatestSetWatchPick["score"]["trend"];
  };
  rationale: string[];
};

const riskAdjustment: Record<
  PredictPortfolioRisk,
  Record<LatestSetWatchPick["score"]["risk"], number>
> = {
  preservation: { low: 24, medium: -8, high: -40 },
  conservative: { low: 18, medium: 2, high: -28 },
  balanced: { low: 8, medium: 6, high: -10 },
  growth: { low: 0, medium: 10, high: 2 },
  aggressive: { low: -2, medium: 8, high: 14 },
};

const isEligible = (
  pick: LatestSetWatchPick,
  risk: PredictPortfolioRisk,
) => {
  if (pick.card.price === null || pick.card.price <= 0) return false;
  if (risk === "preservation") {
    return pick.score.risk === "low" && pick.score.confidence !== "low";
  }
  if (risk === "conservative") {
    return pick.score.risk !== "high" && pick.score.confidence !== "low";
  }
  if (risk === "balanced") {
    return pick.score.confidence !== "low";
  }
  return pick.score.trend !== "falling";
};

const scoreForRisk = (
  pick: LatestSetWatchPick,
  risk: PredictPortfolioRisk,
) => {
  const trendAdjustment = {
    accelerating: risk === "aggressive" ? 14 : 8,
    rising: 6,
    steady: risk === "preservation" || risk === "conservative" ? 7 : 1,
    falling: -18,
  }[pick.score.trend];
  return Math.max(
    1,
    pick.score.total + riskAdjustment[risk][pick.score.risk] + trendAdjustment,
  );
};

export function buildPredictPortfolioScenario(
  picks: LatestSetWatchPick[],
  input: {
    budget: number;
    risk: PredictPortfolioRisk;
    maxPositions: number;
  },
) {
  const ranked = picks
    .filter((pick) => isEligible(pick, input.risk))
    .map((pick) => ({ pick, modelScore: scoreForRisk(pick, input.risk) }))
    .sort(
      (left, right) =>
        right.modelScore - left.modelScore ||
        right.pick.score.total - left.pick.score.total,
    );

  const selected: typeof ranked = [];
  let baseCost = 0;
  for (const candidate of ranked) {
    if (selected.length >= input.maxPositions) break;
    const price = candidate.pick.card.price!;
    if (baseCost + price <= input.budget) {
      selected.push(candidate);
      baseCost += price;
    }
  }

  const remainingBudget = Math.max(0, input.budget - baseCost);
  const totalWeight = selected.reduce(
    (total, item) => total + item.modelScore,
    0,
  );
  const positions = selected.map(({ pick, modelScore }) => {
    const unitPrice = pick.card.price!;
    const additionalBudget =
      totalWeight > 0 ? remainingBudget * (modelScore / totalWeight) : 0;
    const quantity = 1 + Math.floor(additionalBudget / unitPrice);
    const allocation = Math.round(quantity * unitPrice * 100) / 100;
    return {
      card: pick.card,
      quantity,
      unitPrice,
      allocation,
      portfolioWeight: 0,
      modelScore,
      signal: {
        risk: pick.score.risk,
        confidence: pick.score.confidence,
        trend: pick.score.trend,
      },
      rationale: pick.rationale,
    } satisfies PredictPortfolioPosition;
  });
  const invested = positions.reduce(
    (total, position) => total + position.allocation,
    0,
  );

  return {
    budget: input.budget,
    invested: Math.round(invested * 100) / 100,
    unallocated: Math.round((input.budget - invested) * 100) / 100,
    risk: input.risk,
    positions: positions.map((position) => ({
      ...position,
      portfolioWeight:
        invested > 0
          ? Math.round((position.allocation / invested) * 10_000) / 100
          : 0,
    })),
    methodology: {
      summary:
        "A read-only model portfolio that re-ranks observed set opportunities for the requested risk profile, buys at least one affordable copy, and distributes remaining budget by model score.",
      caveat:
        "This scenario does not account for liquidity, seller inventory, fees, taxes, shipping, card condition, language, or execution price. It is not financial advice and is not saved to any account.",
    },
  };
}
