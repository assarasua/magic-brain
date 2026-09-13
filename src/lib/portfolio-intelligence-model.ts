import type { MlCardContext, MlRankingStatus } from "./ml-experience.ts";

export const DETERMINISTIC_COOLING_7D_PERCENT = -2;
export const DETERMINISTIC_COOLING_30D_PERCENT = -5;

type Candidate = {
  id: string;
  name: string;
  setCode: string;
  imageUrl: string | null;
  price: number | null;
  change7d: number | null;
  ml?: MlCardContext | null;
};

type Holding = {
  id: number;
  cardId: string;
  name: string;
  currentPrice: number | null;
  currentValue: number | null;
  change7d: number | null;
  change30d: number | null;
  [key: string]: unknown;
};

export function buildPortfolioIntelligence<
  T extends Holding,
  C extends Candidate,
>(input: {
  holdings: readonly T[];
  candidates: readonly C[];
  ranking: MlRankingStatus;
  maximumCandidatePrice: number;
}) {
  const pricedHoldings = input.holdings.filter(
    (holding) =>
      holding.currentPrice !== null &&
      holding.currentValue !== null &&
      holding.currentValue >= 0,
  );
  const state =
    input.holdings.length === 0
      ? "no_portfolio"
      : pricedHoldings.length === 0
        ? "no_priced_holdings"
        : "active";
  const mode = input.ranking.source === "ml_batch" ? "ml" : "deterministic";
  const heldCardIds = new Set(input.holdings.map((holding) => holding.cardId));
  const candidateAdditions = state === "active"
    ? input.candidates
        .filter(
          (candidate) =>
            !heldCardIds.has(candidate.id) &&
            candidate.price !== null &&
            Number.isFinite(candidate.price) &&
            candidate.price >= 2 &&
            candidate.price <= input.maximumCandidatePrice &&
            (mode === "ml" ||
              (candidate.change7d !== null && candidate.change7d > 0)),
        )
        .slice(0, 3)
    : [];

  const cooling = pricedHoldings
    .filter(
      (holding) =>
        (holding.change7d !== null &&
          holding.change7d <= DETERMINISTIC_COOLING_7D_PERCENT) ||
        (holding.change30d !== null &&
          holding.change30d <= DETERMINISTIC_COOLING_30D_PERCENT),
    )
    .sort(
      (a, b) =>
        Math.min(a.change7d ?? 0, a.change30d ?? 0) -
        Math.min(b.change7d ?? 0, b.change30d ?? 0),
    )
    .slice(0, 3)
    .map((holding) => ({ ...holding, reviewSignal: "cooling" as const }));

  const holdingReviews = cooling.length
    ? cooling
    : pricedHoldings
        .toSorted(
          (a, b) => (b.currentValue ?? 0) - (a.currentValue ?? 0),
        )
        .slice(0, 1)
        .map((holding) => ({ ...holding, reviewSignal: "hold" as const }));

  return {
    mode,
    state,
    candidateState:
      state !== "active"
        ? "portfolio_unavailable"
        : candidateAdditions.length
          ? "available"
          : "no_candidates_after_constraints",
    candidateAdditions,
    holdingReviews,
  };
}
