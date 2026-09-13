export type GrowthTarget = "inflation" | "sp500" | "extreme";

export type PredictionInputs = {
  target: GrowthTarget;
  horizonMonths: 12 | 24 | 36;
  demand: number;
  scarcity: number;
  reprintResilience: number;
};

export type PredictionEvidence = {
  hasMarketData: boolean;
  isUpcoming: boolean;
  coveragePercent: number | null;
  medianReturn90d: number | null;
  breadth90d: number | null;
  volatility90d: number | null;
};

export type PredictionResult = {
  score: number;
  confidence: number;
  targetAnnualReturn: number;
  expectedAnnualRange: { low: number; midpoint: number; high: number };
  horizonRange: { low: number; midpoint: number; high: number };
  probabilityOfTarget: number;
  verdict: "favorable" | "watch" | "speculative" | "unlikely";
  growthGrade: GrowthTarget | "below-inflation";
  drivers: string[];
  risks: string[];
};

const targets: Record<GrowthTarget, number> = {
  inflation: 3,
  sp500: 8,
  extreme: 20,
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const round = (value: number, digits = 1) =>
  Number(value.toFixed(digits));

export function calculateSetPrediction(
  inputs: PredictionInputs,
  evidence: PredictionEvidence,
): PredictionResult {
  const demand = clamp(inputs.demand, 1, 5);
  const scarcity = clamp(inputs.scarcity, 1, 5);
  const reprintResilience = clamp(inputs.reprintResilience, 1, 5);
  const thesisScore =
    ((demand - 1) / 4) * 45 +
    ((scarcity - 1) / 4) * 30 +
    ((reprintResilience - 1) / 4) * 25;

  const marketScore = evidence.hasMarketData
    ? clamp(
        50 +
          (evidence.medianReturn90d ?? 0) * 0.9 +
          ((evidence.breadth90d ?? 50) - 50) * 0.25 -
          (evidence.volatility90d ?? 0) * 0.35,
        0,
        100,
      )
    : 50;
  const confidence = evidence.hasMarketData
    ? clamp(25 + (evidence.coveragePercent ?? 0) * 0.7, 25, 95)
    : evidence.isUpcoming
      ? 18
      : 10;
  const score = clamp(
    thesisScore * 0.55 + marketScore * 0.3 + confidence * 0.15,
    0,
    100,
  );

  const midpoint = clamp((score - 50) * 0.5, -20, 25);
  const targetRisk = inputs.target === "extreme" ? 12 : inputs.target === "sp500" ? 4 : 0;
  const uncertainty =
    8 + (100 - confidence) * 0.22 + targetRisk + (evidence.isUpcoming ? 8 : 0);
  const annualLow = clamp(midpoint - uncertainty, -75, 60);
  const annualHigh = clamp(midpoint + uncertainty * 1.3, -30, 100);
  const years = inputs.horizonMonths / 12;
  const compound = (annualPercent: number) =>
    (Math.pow(Math.max(0.05, 1 + annualPercent / 100), years) - 1) * 100;
  const targetAnnualReturn = targets[inputs.target];
  const probabilityOfTarget = clamp(
    Math.round(
      100 /
        (1 +
          Math.exp(
            -(midpoint - targetAnnualReturn) /
              Math.max(4, uncertainty / 2),
          )),
    ),
    5,
    95,
  );

  const growthGrade: PredictionResult["growthGrade"] =
    annualHigh >= 30 && uncertainty >= 22
      ? "extreme"
      : midpoint >= targets.sp500
        ? "sp500"
        : midpoint >= targets.inflation
          ? "inflation"
          : "below-inflation";
  const verdict: PredictionResult["verdict"] =
    probabilityOfTarget >= 65
      ? "favorable"
      : probabilityOfTarget >= 45
        ? "watch"
        : annualHigh >= targetAnnualReturn
          ? "speculative"
          : "unlikely";

  const drivers = [
    demand >= 4 ? "Strong expected collector demand" : demand === 3 ? "Balanced demand assumption" : null,
    scarcity >= 4 ? "Constrained supply assumption" : null,
    reprintResilience >= 4 ? "Lower assumed reprint exposure" : null,
    (evidence.medianReturn90d ?? 0) > 5 ? "Positive observed 90-day set momentum" : null,
    (evidence.breadth90d ?? 0) >= 60 ? "Broad participation across tracked cards" : null,
  ].filter((item): item is string => item !== null);
  const risks = [
    evidence.isUpcoming ? "The set is unreleased; no live secondary-market history exists" : null,
    !evidence.hasMarketData ? "Prediction is driven by assumptions rather than observed prices" : null,
    demand <= 2 ? "Weak demand assumption" : null,
    scarcity <= 2 ? "High supply pressure assumption" : null,
    reprintResilience <= 2 ? "High reprint exposure assumption" : null,
    (evidence.volatility90d ?? 0) >= 20 ? "High observed price dispersion" : null,
    (evidence.coveragePercent ?? 100) < 40 ? "Low price-data coverage" : null,
  ].filter((item): item is string => item !== null);

  return {
    score: Math.round(score),
    confidence: Math.round(confidence),
    targetAnnualReturn,
    expectedAnnualRange: {
      low: round(annualLow),
      midpoint: round(midpoint),
      high: round(annualHigh),
    },
    horizonRange: {
      low: round(compound(annualLow)),
      midpoint: round(compound(midpoint)),
      high: round(compound(annualHigh)),
    },
    probabilityOfTarget,
    verdict,
    growthGrade,
    drivers: drivers.length ? drivers : ["Neutral assumptions"],
    risks: risks.length ? risks : ["Card markets remain illiquid and can move abruptly"],
  };
}
