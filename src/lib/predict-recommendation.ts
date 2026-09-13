import type { GrowthTarget } from "@/lib/predict-model";
import type { UserPreferences } from "@/lib/user-preferences";

export type PredictRecommendation = {
  target: GrowthTarget;
  horizon: 12 | 24 | 36;
  demand: number;
  scarcity: number;
  reprints: number;
  budget: number;
  maxCardPrice: number;
  positions: number;
  risk: UserPreferences["risk"];
  profile: UserPreferences;
};

export type PredictRecommendationState = Pick<
  PredictRecommendation,
  "target" | "horizon" | "demand" | "scarcity" | "reprints" | "budget" | "risk"
>;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const assumption = (value: number) => clamp(Math.round(value), 1, 5);

export function derivePredictRecommendation(
  preferences: UserPreferences,
): PredictRecommendation {
  const riskBase = {
    preservation: {
      target: "inflation" as const,
      demand: 2,
      scarcity: 4,
      reprints: 5,
    },
    conservative: {
      target: "inflation" as const,
      demand: 3,
      scarcity: 4,
      reprints: 4,
    },
    balanced: {
      target: "sp500" as const,
      demand: 3,
      scarcity: 3,
      reprints: 3,
    },
    growth: {
      target: "sp500" as const,
      demand: 4,
      scarcity: 3,
      reprints: 3,
    },
    aggressive: {
      target: "extreme" as const,
      demand: 5,
      scarcity: 2,
      reprints: 2,
    },
  }[preferences.risk];
  const horizon = {
    short: 12 as const,
    medium: 24 as const,
    long: 36 as const,
  }[preferences.horizon];
  const strategyAdjustment = {
    diversified: { demand: 0, scarcity: 0, reprints: 0 },
    momentum: { demand: 1, scarcity: -1, reprints: -1 },
    stability: { demand: -1, scarcity: 1, reprints: 1 },
    collectible: { demand: 0, scarcity: 1, reprints: 1 },
  }[preferences.strategy];
  const trendAdjustment = {
    any: { demand: 0, scarcity: 0 },
    rising: { demand: 1, scarcity: 0 },
    stable: { demand: -1, scarcity: 1 },
    recovering: { demand: -1, scarcity: 0 },
  }[preferences.marketTrend];
  const eraAdjustment = {
    any: { scarcity: 0, reprints: 0 },
    classic: { scarcity: 1, reprints: 1 },
    established: { scarcity: 0, reprints: 0 },
    recent: { scarcity: -1, reprints: -1 },
  }[preferences.releaseEra];
  const fixedSupplyAdjustment = preferences.reservedOnly ? 1 : 0;
  const budget = clamp(
    Number.isFinite(preferences.defaultBudget)
      ? preferences.defaultBudget
      : 1000,
    25,
    1_000_000,
  );
  const maxCardPrice = clamp(
    Number.isFinite(preferences.maxCardPrice)
      ? preferences.maxCardPrice
      : 250,
    2,
    budget,
  );
  const positions = Math.round(
    clamp(
      Number.isFinite(preferences.positions) ? preferences.positions : 10,
      3,
      20,
    ),
  );

  return {
    target: riskBase.target,
    horizon,
    demand: assumption(
      riskBase.demand +
        strategyAdjustment.demand +
        trendAdjustment.demand,
    ),
    scarcity: assumption(
      riskBase.scarcity +
        strategyAdjustment.scarcity +
        trendAdjustment.scarcity +
        eraAdjustment.scarcity +
        fixedSupplyAdjustment,
    ),
    reprints: assumption(
      riskBase.reprints +
        strategyAdjustment.reprints +
        eraAdjustment.reprints +
        fixedSupplyAdjustment,
    ),
    budget,
    maxCardPrice,
    positions,
    risk: preferences.risk,
    profile: {
      ...preferences,
      defaultBudget: budget,
      maxCardPrice,
      positions,
    },
  };
}

export function isPredictRecommendationApplied(
  recommendation: PredictRecommendation,
  current: PredictRecommendationState,
) {
  return (
    recommendation.target === current.target &&
    recommendation.horizon === current.horizon &&
    recommendation.demand === current.demand &&
    recommendation.scarcity === current.scarcity &&
    recommendation.reprints === current.reprints &&
    recommendation.budget === current.budget &&
    recommendation.risk === current.risk
  );
}
