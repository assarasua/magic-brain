import type { MlCardContext, MlRankingStatus } from "./ml-experience.ts";

export type ForecastHorizon = 1 | 3 | 5;
export type PortfolioForecastSource =
  | "ml_assisted"
  | "deterministic"
  | "unavailable";

export type PortfolioForecastHolding = {
  cardId: string;
  quantity: number;
  purchasePrice: number;
  currentPrice: number | null;
  currentValue: number | null;
  currentPriceDate: string | null;
  acquiredAt: string;
  change30d: number | null;
  ml?: MlCardContext | null;
};

export type PortfolioForecastPoint = {
  date: string;
  conservative: number;
  base: number;
  optimistic: number;
};

export type PortfolioForecast = {
  asOfDate: string;
  dataDate: string | null;
  source: PortfolioForecastSource;
  modelVersion: string | null;
  confidence: "low" | "medium" | "high";
  coverage: {
    forecastableHoldings: number;
    totalHoldings: number;
    projectedValuePercent: number;
    staleCarriedHoldings: number;
    excludedHoldings: number;
    mlValuePercent: number;
  };
  assumptions: {
    annualBaseRatePercent: number;
    annualVolatilityPercent: number;
    compoundingCapPercent: number;
  };
  points: PortfolioForecastPoint[];
};

type HistoryPoint = { date: string; value: number };

const DAY_MS = 86_400_000;
const MAX_ANNUAL_BASE_RATE = 0.12;
const MIN_ANNUAL_BASE_RATE = -0.1;
const MAX_TOTAL_MULTIPLE = 3;
const MIN_TOTAL_MULTIPLE = 0.2;
const STALE_AFTER_DAYS = 14;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const roundMoney = (value: number) => Math.round(value * 100) / 100;
const roundPercent = (value: number) => Math.round(value * 10) / 10;

const dateMillis = (value: string) => {
  const milliseconds = Date.parse(`${value.slice(0, 10)}T00:00:00.000Z`);
  return Number.isFinite(milliseconds) ? milliseconds : null;
};

const addMonths = (date: string, months: number) => {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCMonth(value.getUTCMonth() + months);
  return value.toISOString().slice(0, 10);
};

const historyTrend = (history: readonly HistoryPoint[]) => {
  const valid = history.filter(
    (point) => point.value > 0 && dateMillis(point.date) !== null,
  );
  const first = valid[0];
  const last = valid.at(-1);
  if (!first || !last || first === last) return null;
  const elapsedDays =
    (dateMillis(last.date)! - dateMillis(first.date)!) / DAY_MS;
  if (elapsedDays < 30) return null;
  const annualized = (last.value / first.value) ** (365 / elapsedDays) - 1;
  return clamp(annualized, -0.08, 0.12);
};

const historyVolatility = (history: readonly HistoryPoint[]) => {
  const values = history
    .filter((point) => point.value > 0)
    .map((point) => point.value);
  if (values.length < 10) return null;
  const returns = values
    .slice(1)
    .map((value, index) => Math.log(value / values[index]));
  const mean =
    returns.reduce((total, value) => total + value, 0) / returns.length;
  const variance =
    returns.reduce((total, value) => total + (value - mean) ** 2, 0) /
    returns.length;
  return clamp(Math.sqrt(variance) * Math.sqrt(365), 0.08, 0.65);
};

export function buildPortfolioForecast(input: {
  holdings: readonly PortfolioForecastHolding[];
  history: readonly HistoryPoint[];
  ranking: MlRankingStatus;
  asOfDate?: string;
}): PortfolioForecast {
  const datedPrices = input.holdings
    .map((holding) => holding.currentPriceDate?.slice(0, 10) ?? null)
    .filter((date): date is string => date !== null)
    .sort();
  const asOfDate =
    input.asOfDate?.slice(0, 10) ??
    new Date().toISOString().slice(0, 10);
  const dataDate = datedPrices.at(-1) ?? null;
  const asOfMillis = dateMillis(asOfDate) ?? Date.now();
  const totalReferenceValue = input.holdings.reduce(
    (total, holding) =>
      total +
      (holding.currentValue ??
        Math.max(0, holding.purchasePrice * holding.quantity)),
    0,
  );
  const valued = input.holdings.filter(
    (holding) =>
      holding.currentPrice !== null &&
      holding.currentPrice > 0 &&
      holding.currentValue !== null &&
      holding.currentValue > 0,
  );
  const stale = valued.filter((holding) => {
    const priceMillis = holding.currentPriceDate
      ? dateMillis(holding.currentPriceDate)
      : null;
    return (
      priceMillis === null ||
      (asOfMillis - priceMillis) / DAY_MS > STALE_AFTER_DAYS
    );
  });
  const staleIds = new Set(stale.map((holding) => holding.cardId));
  const projected = valued.filter((holding) => !staleIds.has(holding.cardId));
  const projectedValue = projected.reduce(
    (total, holding) => total + holding.currentValue!,
    0,
  );
  const carriedValue = stale.reduce(
    (total, holding) => total + holding.currentValue!,
    0,
  );
  const anchorValue = projectedValue + carriedValue;
  const weights = projected.map((holding) => ({
    holding,
    weight: projectedValue > 0 ? holding.currentValue! / projectedValue : 0,
  }));
  const concentration = weights.reduce(
    (total, item) => total + item.weight ** 2,
    0,
  );
  const observedTrend = historyTrend(input.history);
  const observedVolatility = historyVolatility(input.history);
  const mlEligible =
    input.ranking.source === "ml_batch"
      ? weights.filter(
          ({ holding }) =>
            holding.ml?.modelVersion === input.ranking.modelVersion &&
            holding.ml.scoreDate === input.ranking.scoreDate &&
            dateMillis(holding.ml.scoreDate) !== null &&
            (asOfMillis - dateMillis(holding.ml.scoreDate)!) / DAY_MS >= 0 &&
            (asOfMillis - dateMillis(holding.ml.scoreDate)!) / DAY_MS <= 2 &&
            holding.ml.confidence >= 0.6,
        )
      : [];
  const mlValue = mlEligible.reduce(
    (total, item) => total + item.holding.currentValue!,
    0,
  );
  const mlValuePercent =
    projectedValue > 0 ? (mlValue / projectedValue) * 100 : 0;

  const weightedMomentum = weights.reduce((total, { holding, weight }) => {
    const boundedMomentum = clamp((holding.change30d ?? 0) / 100, -0.25, 0.25);
    return total + boundedMomentum * weight;
  }, 0);
  const weightedPurchaseSignal = weights.reduce(
    (total, { holding, weight }) => {
      if (holding.purchasePrice <= 0 || holding.currentPrice === null) {
        return total;
      }
      return (
        total +
        clamp(holding.currentPrice / holding.purchasePrice - 1, -0.5, 0.5) *
          weight
      );
    },
    0,
  );
  const weightedMlTilt = mlEligible.reduce((total, { holding, weight }) => {
    const probability = holding.ml?.probabilityPositive30d;
    if (probability === null || probability === undefined) return total;
    return (
      total +
      clamp(probability - 0.5, -0.35, 0.35) *
        0.08 *
        holding.ml!.confidence *
        weight
    );
  }, 0);
  const annualBaseRate = clamp(
    0.025 +
      (observedTrend ?? 0) * 0.35 +
      weightedMomentum * 0.18 +
      weightedPurchaseSignal * 0.04 +
      weightedMlTilt,
    MIN_ANNUAL_BASE_RATE,
    MAX_ANNUAL_BASE_RATE,
  );
  const sparsePenalty = observedVolatility === null ? 0.08 : 0;
  const missingPenalty =
    input.holdings.length > 0
      ? (1 - valued.length / input.holdings.length) * 0.1
      : 0;
  const mlDownside = mlEligible.reduce((total, { holding, weight }) => {
    const downside = holding.ml?.expectedDownside90d;
    return total + Math.abs(Math.min(0, downside ?? 0)) * weight;
  }, 0);
  const annualVolatility = clamp(
    (observedVolatility ?? 0.18) +
      concentration * 0.12 +
      sparsePenalty +
      missingPenalty +
      mlDownside * 0.2,
    0.12,
    0.7,
  );

  const points =
    anchorValue > 0
      ? Array.from({ length: 61 }, (_, month) => {
          const years = month / 12;
          const baseMultiple = clamp(
            (1 + annualBaseRate) ** years,
            MIN_TOTAL_MULTIPLE,
            MAX_TOTAL_MULTIPLE,
          );
          const uncertainty = annualVolatility * Math.sqrt(years) * 0.72;
          const lowerMultiple = clamp(
            baseMultiple * Math.exp(-uncertainty),
            MIN_TOTAL_MULTIPLE,
            MAX_TOTAL_MULTIPLE,
          );
          const upperMultiple = clamp(
            baseMultiple * Math.exp(uncertainty),
            MIN_TOTAL_MULTIPLE,
            MAX_TOTAL_MULTIPLE,
          );
          return {
            date: addMonths(asOfDate, month),
            conservative: roundMoney(
              carriedValue + projectedValue * lowerMultiple,
            ),
            base: roundMoney(carriedValue + projectedValue * baseMultiple),
            optimistic: roundMoney(
              carriedValue + projectedValue * upperMultiple,
            ),
          };
        })
      : [];
  const projectedCoverage =
    totalReferenceValue > 0 ? (projectedValue / totalReferenceValue) * 100 : 0;
  const source: PortfolioForecastSource =
    points.length === 0
      ? "unavailable"
      : mlEligible.length > 0
        ? "ml_assisted"
        : "deterministic";
  const confidence =
    projectedCoverage >= 85 &&
    input.history.length >= 30 &&
    (source !== "ml_assisted" || mlValuePercent >= 70)
      ? "high"
      : projectedCoverage >= 55 && input.history.length >= 10
        ? "medium"
        : "low";

  return {
    asOfDate,
    dataDate,
    source,
    modelVersion:
      source === "ml_assisted" ? input.ranking.modelVersion : null,
    confidence,
    coverage: {
      forecastableHoldings: projected.length,
      totalHoldings: input.holdings.length,
      projectedValuePercent: roundPercent(projectedCoverage),
      staleCarriedHoldings: stale.length,
      excludedHoldings: input.holdings.length - valued.length,
      mlValuePercent: roundPercent(mlValuePercent),
    },
    assumptions: {
      annualBaseRatePercent: roundPercent(annualBaseRate * 100),
      annualVolatilityPercent: roundPercent(annualVolatility * 100),
      compoundingCapPercent: (MAX_TOTAL_MULTIPLE - 1) * 100,
    },
    points,
  };
}
