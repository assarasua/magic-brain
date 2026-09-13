export const MARKET_BRIEF_SCHEMA_VERSION = 1;

export type MarketPriceSnapshot = {
  cardId: string;
  name: string;
  setCode: string;
  setName: string;
  currentPrice: number;
  price7d: number | null;
  price30d: number | null;
};

export type MarketBriefItem = {
  cardId: string;
  name: string;
  setCode: string;
  setName: string;
  currentPrice: number;
  change7d: number | null;
  change30d: number | null;
};

export type MarketBriefContent = {
  methodologyVersion: number;
  marketDataDate: string;
  comparisonDates: {
    sevenDay: string | null;
    thirtyDay: string | null;
  };
  coverage: {
    currentCards: number;
    sevenDayComparableCards: number;
    thirtyDayComparableCards: number;
  };
  categories: {
    strongGrowth: MarketBriefItem[];
    recoveryOpportunities: MarketBriefItem[];
    lostMomentum: MarketBriefItem[];
    majorRepricing: MarketBriefItem[];
  };
  breadth: {
    advancers: number;
    decliners: number;
    unchanged: number;
    advancePercent: number | null;
    score: number | null;
  };
  caveats: {
    methodology: "stored_prices_only";
    freshness: "newest_available_market_date";
    comparison: "nearest_available_on_or_before";
    eligibility: "eur_nonfoil_between_2_and_5000";
    noExternalNews: true;
  };
};

export type DeriveMarketBriefInput = {
  marketDataDate: string;
  comparison7dDate: string | null;
  comparison30dDate: string | null;
  cards: MarketPriceSnapshot[];
};

const percentChange = (current: number, previous: number | null) =>
  previous && previous > 0 ? ((current - previous) / previous) * 100 : null;

const rounded = (value: number | null) =>
  value === null ? null : Math.round(value * 100) / 100;

const itemFromSnapshot = (
  card: MarketPriceSnapshot,
): MarketBriefItem => ({
  cardId: card.cardId,
  name: card.name,
  setCode: card.setCode.toLowerCase(),
  setName: card.setName,
  currentPrice: rounded(card.currentPrice) ?? 0,
  change7d: rounded(percentChange(card.currentPrice, card.price7d)),
  change30d: rounded(percentChange(card.currentPrice, card.price30d)),
});

const categorySort = (items: MarketBriefItem[], score: (item: MarketBriefItem) => number) =>
  [...items]
    .sort((a, b) =>
      score(b) - score(a) ||
      a.name.localeCompare(b.name, "en") ||
      a.cardId.localeCompare(b.cardId),
    )
    .slice(0, 8);

export function deriveMarketBrief(
  input: DeriveMarketBriefInput,
): MarketBriefContent {
  const items = input.cards.map(itemFromSnapshot);
  const comparable7d = items.filter((item) => item.change7d !== null);
  const comparable30d = items.filter((item) => item.change30d !== null);
  const advancers = comparable7d.filter((item) => item.change7d! > 0).length;
  const decliners = comparable7d.filter((item) => item.change7d! < 0).length;
  const unchanged = comparable7d.length - advancers - decliners;

  return {
    methodologyVersion: MARKET_BRIEF_SCHEMA_VERSION,
    marketDataDate: input.marketDataDate,
    comparisonDates: {
      sevenDay: input.comparison7dDate,
      thirtyDay: input.comparison30dDate,
    },
    coverage: {
      currentCards: items.length,
      sevenDayComparableCards: comparable7d.length,
      thirtyDayComparableCards: comparable30d.length,
    },
    categories: {
      strongGrowth: categorySort(
        items.filter((item) =>
          item.change7d !== null &&
          item.change30d !== null &&
          item.change7d >= 5 &&
          item.change30d >= 10),
        (item) => item.change7d! + item.change30d!,
      ),
      recoveryOpportunities: categorySort(
        items.filter((item) =>
          item.change7d !== null &&
          item.change30d !== null &&
          item.change7d >= 5 &&
          item.change30d <= -5),
        (item) => item.change7d! - item.change30d!,
      ),
      lostMomentum: categorySort(
        items.filter((item) =>
          item.change7d !== null &&
          item.change30d !== null &&
          item.change7d <= -5 &&
          item.change30d >= 5),
        (item) => item.change30d! - item.change7d!,
      ),
      majorRepricing: categorySort(
        items.filter((item) =>
          Math.abs(item.change7d ?? 0) >= 15 ||
          Math.abs(item.change30d ?? 0) >= 30),
        (item) => Math.max(
          Math.abs(item.change7d ?? 0),
          Math.abs(item.change30d ?? 0),
        ),
      ),
    },
    breadth: {
      advancers,
      decliners,
      unchanged,
      advancePercent: comparable7d.length
        ? rounded((advancers / comparable7d.length) * 100)
        : null,
      score: comparable7d.length
        ? rounded(((advancers - decliners) / comparable7d.length) * 100)
        : null,
    },
    caveats: {
      methodology: "stored_prices_only",
      freshness: "newest_available_market_date",
      comparison: "nearest_available_on_or_before",
      eligibility: "eur_nonfoil_between_2_and_5000",
      noExternalNews: true,
    },
  };
}
