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
  | "release"
  | "name"
  | "median"
  | "breadth"
  | "coverage"
  | "tracked";

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
  const descendingValue = (set: MarketPulseSet) => {
    if (sort === "median") return set.medianReturn;
    if (sort === "breadth") return set.breadth;
    if (sort === "coverage") return set.coveragePercent;
    if (sort === "tracked") return set.trackedCards;
    return null;
  };

  return [...sets].sort((left, right) => {
    if (sort === "name") return left.name.localeCompare(right.name);
    if (sort === "release") {
      return (
        (right.releasedAt ?? "").localeCompare(left.releasedAt ?? "") ||
        left.name.localeCompare(right.name)
      );
    }
    const leftValue = descendingValue(left);
    const rightValue = descendingValue(right);
    if (leftValue === null && rightValue === null) {
      return left.name.localeCompare(right.name);
    }
    if (leftValue === null) return 1;
    if (rightValue === null) return -1;
    return rightValue - leftValue || left.name.localeCompare(right.name);
  });
}
