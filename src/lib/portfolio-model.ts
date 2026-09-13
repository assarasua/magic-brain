export const MAX_PORTFOLIO_QUANTITY = 1_000_000;
export const MAX_PORTFOLIO_UNIT_PRICE = 999_999_999_999.99;

export type PortfolioOpportunityClassification =
  | "strong_growth"
  | "recovery_opportunity"
  | "lost_momentum";

export type PortfolioNumericHolding = {
  id?: number;
  name?: string;
  quantity: number;
  purchasePrice: number;
  currentPrice: number | null;
  currentValue: number | null;
  change7d: number | null;
  change30d: number | null;
  opportunityClassification: PortfolioOpportunityClassification | null;
};

export type PortfolioUpdate = {
  quantity?: number;
  purchasePrice?: number;
  language?: string;
};

export function parsePortfolioUpdate(
  value: unknown,
  isLanguage: (value: unknown) => value is string,
): PortfolioUpdate | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  const allowedKeys = new Set(["quantity", "purchasePrice", "language"]);
  if (
    keys.length === 0 ||
    keys.some((key) => !allowedKeys.has(key)) ||
    (Object.hasOwn(record, "quantity") &&
      !isValidPortfolioQuantity(record.quantity)) ||
    (Object.hasOwn(record, "purchasePrice") &&
      !isValidPortfolioUnitPrice(record.purchasePrice)) ||
    (Object.hasOwn(record, "language") && !isLanguage(record.language))
  ) {
    return null;
  }

  const update: PortfolioUpdate = {};
  if (Object.hasOwn(record, "quantity")) {
    update.quantity = record.quantity as number;
  }
  if (Object.hasOwn(record, "purchasePrice")) {
    update.purchasePrice = record.purchasePrice as number;
  }
  if (Object.hasOwn(record, "language")) {
    update.language = record.language as string;
  }
  return update;
}

const hasAtMostTwoDecimals = (value: number) =>
  Math.abs(value * 100 - Math.round(value * 100)) < 1e-7;

export function isValidPortfolioQuantity(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= MAX_PORTFOLIO_QUANTITY
  );
}

export function isValidPortfolioUnitPrice(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= MAX_PORTFOLIO_UNIT_PRICE &&
    hasAtMostTwoDecimals(value)
  );
}

export function classifyPortfolioOpportunity(
  change7d: number,
  change30d: number,
): PortfolioOpportunityClassification {
  if (change7d > 0 && change30d > 0) return "strong_growth";
  if (change7d > 0 && change30d <= 0) return "recovery_opportunity";
  return "lost_momentum";
}

export function calculatePortfolioSummary<T extends PortfolioNumericHolding>(
  holdings: T[],
) {
  const invested = holdings.reduce(
    (total, holding) =>
      total + holding.purchasePrice * holding.quantity,
    0,
  );
  const priced = holdings.filter((holding) => holding.currentValue !== null);
  const valuedInvested = priced.reduce(
    (total, holding) =>
      total + holding.purchasePrice * holding.quantity,
    0,
  );
  const value = priced.reduce(
    (total, holding) => total + holding.currentValue!,
    0,
  );
  const unrealizedGain = value - valuedInvested;
  const contributors = priced
    .map((holding) => {
      const costBasis = holding.purchasePrice * holding.quantity;
      const gain = holding.currentValue! - costBasis;
      return {
        id: holding.id ?? null,
        name: holding.name ?? null,
        gain,
        gainPercent: costBasis > 0 ? (gain / costBasis) * 100 : null,
        currentValue: holding.currentValue!,
      };
    })
    .sort((a, b) => b.gain - a.gain);

  return {
    invested,
    value,
    // Kept for existing consumers; both fields are unrealized and only include
    // holdings with a current market price.
    gain: unrealizedGain,
    gainPercent:
      valuedInvested > 0 ? (unrealizedGain / valuedInvested) * 100 : 0,
    unrealizedGain,
    unrealizedGainPercent:
      valuedInvested > 0 ? (unrealizedGain / valuedInvested) * 100 : null,
    valuedInvested,
    unpricedInvested: invested - valuedInvested,
    pricedHoldings: priced.length,
    unpricedHoldings: holdings.length - priced.length,
    zeroCostHoldings: priced.filter(
      (holding) => holding.purchasePrice * holding.quantity === 0,
    ).length,
    pricingCoveragePercent: holdings.length
      ? (priced.length / holdings.length) * 100
      : 0,
    winners: contributors.filter((holding) => holding.gain > 0).length,
    losers: contributors.filter((holding) => holding.gain < 0).length,
    flat: contributors.filter((holding) => holding.gain === 0).length,
    bestContributor: contributors[0] ?? null,
    worstContributor: contributors.at(-1) ?? null,
    cardCount: holdings.reduce(
      (total, holding) => total + holding.quantity,
      0,
    ),
  };
}

export function calculateOpportunityAnalytics<
  T extends PortfolioNumericHolding,
>(holdings: T[], portfolioValue: number) {
  const classifications: PortfolioOpportunityClassification[] = [
    "strong_growth",
    "recovery_opportunity",
    "lost_momentum",
  ];
  const comparable = holdings.filter(
    (holding) => holding.opportunityClassification !== null,
  );

  return {
    comparableHoldings: comparable.length,
    coveragePercent: holdings.length
      ? (comparable.length / holdings.length) * 100
      : 0,
    classifications: Object.fromEntries(
      classifications.map((classification) => {
        const matching = comparable.filter(
          (holding) =>
            holding.opportunityClassification === classification,
        );
        const marketValue = matching.reduce(
          (total, holding) => total + (holding.currentValue ?? 0),
          0,
        );
        return [
          classification,
          {
            count: matching.length,
            holdingsPercent: comparable.length
              ? (matching.length / comparable.length) * 100
              : 0,
            marketValue,
            exposurePercent:
              portfolioValue > 0 ? (marketValue / portfolioValue) * 100 : 0,
          },
        ];
      }),
    ) as Record<
      PortfolioOpportunityClassification,
      {
        count: number;
        holdingsPercent: number;
        marketValue: number;
        exposurePercent: number;
      }
    >,
  };
}
