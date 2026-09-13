export type MarketPulseSet = {
  code: string;
  name: string;
  releasedAt: string | null;
  cardCount: number;
  trackedCards: number;
  coveragePercent: number | null;
  medianReturn: number | null;
  advancers: number;
  decliners: number;
  breadth: number | null;
  leadingMover: {
    cardId: string;
    name: string;
    returnPercent: number;
  } | null;
  available: boolean;
};

export type MarketPulseSort =
  | "release-desc"
  | "release-asc"
  | "name-asc"
  | "name-desc"
  | "median-desc"
  | "median-asc"
  | "breadth-desc"
  | "breadth-asc"
  | "coverage-desc"
  | "coverage-asc"
  | "tracked-desc"
  | "tracked-asc";

export type MarketPulseRow = {
  code: string;
  name: string;
  released_at: string | null;
  card_count: string;
  tracked_cards: string;
  coverage_percent: string | null;
  median_return: string | null;
  advancers: string;
  decliners: string;
  breadth: string | null;
  leading_card_id: string | null;
  leading_card_name: string | null;
  leading_return: string | null;
  latest_date: string | null;
  comparison_date: string | null;
};

const numberOrNull = (value: string | null) =>
  value === null ? null : Number(value);

export function mapMarketPulseRow(row: MarketPulseRow): MarketPulseSet {
  const trackedCards = Number(row.tracked_cards);
  const leadingReturn = numberOrNull(row.leading_return);

  return {
    code: row.code,
    name: row.name,
    releasedAt: row.released_at,
    cardCount: Number(row.card_count),
    trackedCards,
    coveragePercent: numberOrNull(row.coverage_percent),
    medianReturn: numberOrNull(row.median_return),
    advancers: Number(row.advancers),
    decliners: Number(row.decliners),
    breadth: numberOrNull(row.breadth),
    leadingMover:
      row.leading_card_id && row.leading_card_name && leadingReturn !== null
        ? {
            cardId: row.leading_card_id,
            name: row.leading_card_name,
            returnPercent: leadingReturn,
          }
        : null,
    available: trackedCards > 0,
  };
}

export function sortMarketPulseSets(
  sets: MarketPulseSet[],
  sort: MarketPulseSort,
): MarketPulseSet[] {
  const compareNames = (left: MarketPulseSet, right: MarketPulseSet) =>
    left.name.localeCompare(right.name, "en", { sensitivity: "base" }) ||
    left.code.localeCompare(right.code, "en", { sensitivity: "base" });
  const direction = sort.endsWith("-asc") ? 1 : -1;
  const metricValue = (set: MarketPulseSet) => {
    if (sort.startsWith("median-")) return set.available ? set.medianReturn : null;
    if (sort.startsWith("breadth-")) return set.available ? set.breadth : null;
    if (sort.startsWith("coverage-")) return set.available ? set.coveragePercent : null;
    if (sort.startsWith("tracked-")) return set.available ? set.trackedCards : null;
    return null;
  };

  return [...sets].sort((left, right) => {
    if (sort.startsWith("name-")) {
      return direction * compareNames(left, right);
    }
    if (sort.startsWith("release-")) {
      if (left.releasedAt === null && right.releasedAt === null) return compareNames(left, right);
      if (left.releasedAt === null) return 1;
      if (right.releasedAt === null) return -1;
      return direction * left.releasedAt.localeCompare(right.releasedAt) || compareNames(left, right);
    }
    const leftValue = metricValue(left);
    const rightValue = metricValue(right);
    if (leftValue === null && rightValue === null) {
      return compareNames(left, right);
    }
    if (leftValue === null) return 1;
    if (rightValue === null) return -1;
    return direction * (leftValue - rightValue) || compareNames(left, right);
  });
}
