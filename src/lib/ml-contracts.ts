export const ML_FEATURE_CONTRACT_VERSION = "v1";
export const ML_LABEL_CONTRACT_VERSION = "v1";

export type IsoDate = `${number}-${number}-${number}`;

export type PriceObservation = {
  date: IsoDate;
  source: string;
  eur: number | null;
};

export type PointInTimeCardMetadata = {
  scryfallId: string;
  metadataAvailableAt: IsoDate;
  releasedAt: IsoDate | null;
  rarity: string | null;
  cardType: string | null;
  isReserved: boolean | null;
};

export type PointInTimeFeatureSnapshot = {
  contractVersion: typeof ML_FEATURE_CONTRACT_VERSION;
  scryfallId: string;
  asOfDate: IsoDate;
  priceSource: string;
  metadataAvailableAt: IsoDate;
  sourceMaxPriceDate: IsoDate;
  priceEur: number;
  momentum7d: number | null;
  momentum30d: number | null;
  momentum90d: number | null;
  volatility30d: number | null;
  drawdown90d: number | null;
  historyDays: number;
  observations90d: number;
  priceStalenessDays: number;
  cardAgeDays: number | null;
  rarity: string | null;
  cardType: string | null;
  isReserved: boolean | null;
};

export type OutcomeLabels = {
  contractVersion: typeof ML_LABEL_CONTRACT_VERSION;
  asOfDate: IsoDate;
  labelCutoffDate: IsoDate;
  sourceMinFutureDate: IsoDate | null;
  sourceMaxFutureDate: IsoDate | null;
  return7d: number | null;
  return30d: number | null;
  return90d: number | null;
  downside90d: number | null;
  realizedVolatility90d: number | null;
  has7dPrice: boolean;
  has30dPrice: boolean;
  has90dPrice: boolean;
};

const DAY_MS = 86_400_000;
const SOURCE_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/;

function dateMillis(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid ISO date: ${value}`);
  }
  const milliseconds = Date.parse(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(milliseconds) ||
    new Date(milliseconds).toISOString().slice(0, 10) !== value
  ) {
    throw new Error(`Invalid ISO date: ${value}`);
  }
  return milliseconds;
}

function addDays(value: IsoDate, days: number): IsoDate {
  return new Date(dateMillis(value) + days * DAY_MS)
    .toISOString()
    .slice(0, 10) as IsoDate;
}

function daysBetween(earlier: IsoDate, later: IsoDate): number {
  return (dateMillis(later) - dateMillis(earlier)) / DAY_MS;
}

function finitePositive(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function round(value: number): number {
  return Number(value.toFixed(8));
}

function normalizePrices(
  prices: readonly PriceObservation[],
  source: string,
): Array<{ date: IsoDate; eur: number }> {
  const seen = new Set<string>();
  const normalized: Array<{ date: IsoDate; eur: number }> = [];
  for (const price of prices) {
    if (price.source !== source) continue;
    dateMillis(price.date);
    if (seen.has(price.date)) {
      throw new Error(`Duplicate ${source} price date: ${price.date}`);
    }
    seen.add(price.date);
    if (finitePositive(price.eur)) {
      normalized.push({ date: price.date, eur: price.eur });
    }
  }
  return normalized.sort((left, right) => left.date.localeCompare(right.date));
}

function latestAtOrBefore(
  prices: readonly { date: IsoDate; eur: number }[],
  date: IsoDate,
) {
  for (let index = prices.length - 1; index >= 0; index -= 1) {
    if (prices[index].date <= date) return prices[index];
  }
  return null;
}

function logReturnVolatility(
  prices: readonly { date: IsoDate; eur: number }[],
): number | null {
  if (prices.length < 2) return null;
  const returns = prices.slice(1).map((price, index) =>
    Math.log(price.eur / prices[index].eur),
  );
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce(
    (sum, value) => sum + (value - mean) ** 2,
    0,
  ) / returns.length;
  return round(Math.sqrt(variance));
}

export function buildPointInTimeFeatureSnapshot(input: {
  card: PointInTimeCardMetadata;
  prices: readonly PriceObservation[];
  asOfDate: IsoDate;
  priceSource: string;
}): PointInTimeFeatureSnapshot {
  dateMillis(input.asOfDate);
  dateMillis(input.card.metadataAvailableAt);
  if (!SOURCE_PATTERN.test(input.priceSource)) {
    throw new Error("Invalid price source");
  }
  if (input.card.metadataAvailableAt > input.asOfDate) {
    throw new Error("Card metadata was unavailable on the scoring date");
  }
  if (input.card.releasedAt) {
    dateMillis(input.card.releasedAt);
    if (input.card.releasedAt > input.asOfDate) {
      throw new Error("Card was unreleased on the scoring date");
    }
  }

  const eligible = normalizePrices(input.prices, input.priceSource)
    .filter((price) => price.date <= input.asOfDate);
  const current = eligible.at(-1);
  if (!current) throw new Error("No positive point-in-time price is available");

  const momentum = (days: number) => {
    const reference = latestAtOrBefore(eligible, addDays(input.asOfDate, -days));
    return reference ? round(current.eur / reference.eur - 1) : null;
  };
  const prices30d = eligible.filter(
    (price) => price.date >= addDays(input.asOfDate, -30),
  );
  const prices90d = eligible.filter(
    (price) => price.date >= addDays(input.asOfDate, -90),
  );
  const peak90d = Math.max(...prices90d.map((price) => price.eur));
  const first = eligible[0];

  const snapshot: PointInTimeFeatureSnapshot = {
    contractVersion: ML_FEATURE_CONTRACT_VERSION,
    scryfallId: input.card.scryfallId,
    asOfDate: input.asOfDate,
    priceSource: input.priceSource,
    metadataAvailableAt: input.card.metadataAvailableAt,
    sourceMaxPriceDate: current.date,
    priceEur: current.eur,
    momentum7d: momentum(7),
    momentum30d: momentum(30),
    momentum90d: momentum(90),
    volatility30d: logReturnVolatility(prices30d),
    drawdown90d: round(current.eur / peak90d - 1),
    historyDays: daysBetween(first.date, current.date),
    observations90d: prices90d.length,
    priceStalenessDays: daysBetween(current.date, input.asOfDate),
    cardAgeDays: input.card.releasedAt
      ? daysBetween(input.card.releasedAt, input.asOfDate)
      : null,
    rarity: input.card.rarity,
    cardType: input.card.cardType,
    isReserved: input.card.isReserved,
  };
  assertPointInTimeFeatureSnapshot(snapshot);
  return snapshot;
}

export function assertPointInTimeFeatureSnapshot(
  snapshot: PointInTimeFeatureSnapshot,
): void {
  dateMillis(snapshot.asOfDate);
  dateMillis(snapshot.metadataAvailableAt);
  dateMillis(snapshot.sourceMaxPriceDate);
  if (
    snapshot.metadataAvailableAt > snapshot.asOfDate ||
    snapshot.sourceMaxPriceDate > snapshot.asOfDate
  ) {
    throw new Error("Feature snapshot contains post-scoring information");
  }
  if (
    daysBetween(snapshot.sourceMaxPriceDate, snapshot.asOfDate) !==
    snapshot.priceStalenessDays
  ) {
    throw new Error("Feature snapshot staleness is inconsistent");
  }
  if (!finitePositive(snapshot.priceEur)) {
    throw new Error("Feature snapshot price must be positive");
  }
}

export function buildOutcomeLabels(input: {
  snapshot: PointInTimeFeatureSnapshot;
  prices: readonly PriceObservation[];
}): OutcomeLabels {
  assertPointInTimeFeatureSnapshot(input.snapshot);
  const cutoff = addDays(input.snapshot.asOfDate, 90);
  const future = normalizePrices(input.prices, input.snapshot.priceSource)
    .filter(
      (price) =>
        price.date > input.snapshot.asOfDate && price.date <= cutoff,
    );
  const byDate = new Map(future.map((price) => [price.date, price.eur]));
  const futureReturn = (days: number) => {
    const price = byDate.get(addDays(input.snapshot.asOfDate, days));
    return price === undefined
      ? null
      : round(price / input.snapshot.priceEur - 1);
  };
  const return7d = futureReturn(7);
  const return30d = futureReturn(30);
  const return90d = futureReturn(90);
  const labelPrices = [
    { date: input.snapshot.asOfDate, eur: input.snapshot.priceEur },
    ...future,
  ];

  return {
    contractVersion: ML_LABEL_CONTRACT_VERSION,
    asOfDate: input.snapshot.asOfDate,
    labelCutoffDate: cutoff,
    sourceMinFutureDate: future.at(0)?.date ?? null,
    sourceMaxFutureDate: future.at(-1)?.date ?? null,
    return7d,
    return30d,
    return90d,
    downside90d: future.length
      ? round(
          Math.min(
            0,
            ...future.map(
              (price) => price.eur / input.snapshot.priceEur - 1,
            ),
          ),
        )
      : null,
    realizedVolatility90d: logReturnVolatility(labelPrices),
    has7dPrice: return7d !== null,
    has30dPrice: return30d !== null,
    has90dPrice: return90d !== null,
  };
}
