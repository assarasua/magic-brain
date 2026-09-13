import { getMarketMovers } from "@/lib/catalog";
import {
  getMlExperienceForCards,
  getPersonalizedBatchSignals,
  unavailableMlExperience,
} from "@/lib/ml-serving";
import { getPortfolio } from "@/lib/portfolio";
import { buildPortfolioForecast } from "@/lib/portfolio-forecast-model";
import { buildPortfolioIntelligence } from "@/lib/portfolio-intelligence-model";
import { derivePredictRecommendation } from "@/lib/predict-recommendation";
import { query } from "@/lib/db";
import { normalizeUserPreferences } from "@/lib/user-preferences";
import { ApiError } from "./core";

async function accountPreferences(ownerId: string) {
  const result = await query<{ preferences: unknown }>(
    `select preferences from app_users
     where id = $1 and authenticated_at is not null`,
    [ownerId],
  );
  if (!result.rows[0]) {
    throw new ApiError(401, "invalid_api_key", "The API key is invalid");
  }
  return normalizeUserPreferences(result.rows[0].preferences);
}

export async function getAccountSignals(ownerId: string, limit: number) {
  const preferences = await accountPreferences(ownerId);
  const personalized = await getPersonalizedBatchSignals(
    ownerId,
    preferences,
    limit,
  ).catch(() => ({
    signals: [],
    ranking: unavailableMlExperience().ranking,
  }));
  if (personalized.ranking.source === "ml_batch" && personalized.signals.length) {
    return {
      generatedAt: new Date().toISOString(),
      asOf: personalized.ranking.scoreDate,
      signals: personalized.signals,
      ranking: personalized.ranking,
      safety: signalSafety("verified_promoted_batch_model"),
    };
  }

  const fallback = await getMarketMovers(limit, "gainers", 7);
  return {
    generatedAt: new Date().toISOString(),
    asOf: fallback[0]?.priceDate ?? null,
    signals: fallback.map((card) => ({
      ...card,
      direction: "up" as const,
      ml: null,
    })),
    ranking: personalized.ranking,
    safety: signalSafety("deterministic_market_momentum_fallback"),
  };
}

export async function getAccountPortfolio(ownerId: string, listId?: string) {
  const preferences = await accountPreferences(ownerId);
  const portfolio = await getPortfolio(ownerId, listId);
  if (!portfolio) {
    throw new ApiError(404, "not_found", "Portfolio list not found");
  }
  const [experience, personalized] = await Promise.all([
    getMlExperienceForCards(
      ownerId,
      portfolio.holdings.map((holding) => holding.cardId),
    ).catch(unavailableMlExperience),
    getPersonalizedBatchSignals(ownerId, preferences, 8).catch(() => ({
      signals: [],
      ranking: unavailableMlExperience().ranking,
    })),
  ]);
  const useMlCandidates =
    personalized.ranking.source === "ml_batch" &&
    personalized.signals.length > 0;
  const candidatePool = useMlCandidates
    ? personalized.signals
    : await getMarketMovers(24, "gainers", 7).catch(() => []);
  const intelligence = buildPortfolioIntelligence({
    holdings: portfolio.holdings,
    candidates: candidatePool,
    ranking: personalized.ranking,
    maximumCandidatePrice: Math.min(
      preferences.maxCardPrice,
      preferences.defaultBudget * 0.45,
    ),
  });
  const forecast = buildPortfolioForecast({
    holdings: portfolio.holdings.map((holding) => ({
      ...holding,
      ml: experience.scores[holding.cardId] ?? null,
    })),
    history: portfolio.history,
    ranking: experience.ranking,
  });
  const value = portfolio.summary.value;
  const concentration = portfolio.holdings
    .filter((holding) => holding.currentValue !== null)
    .map((holding) => ({
      holdingId: holding.id,
      cardId: holding.cardId,
      name: holding.name,
      currentValue: holding.currentValue!,
      portfolioPercent: value > 0 ? (holding.currentValue! / value) * 100 : 0,
    }))
    .sort((left, right) => right.currentValue - left.currentValue);

  return {
    asOf: forecast.dataDate,
    currency: "EUR",
    summary: portfolio.summary,
    contributors: {
      best: portfolio.summary.bestContributor,
      worst: portfolio.summary.worstContributor,
    },
    concentration: {
      top: concentration.slice(0, 10),
      topHoldingPercent: concentration[0]?.portfolioPercent ?? 0,
      topFivePercent: concentration
        .slice(0, 5)
        .reduce((total, item) => total + item.portfolioPercent, 0),
    },
    opportunities: portfolio.opportunities,
    holdings: portfolio.holdings.map((holding) => ({
      ...holding,
      ml: experience.scores[holding.cardId] ?? null,
    })),
    history: portfolio.history,
    forecast: {
      ...forecast,
      horizons: Object.fromEntries(
        ([1, 3, 5] as const).map((years) => [
          `${years}y`,
          forecast.points[years * 12] ?? null,
        ]),
      ),
    },
    intelligence: {
      ranking: personalized.ranking,
      ...intelligence,
    },
    safety: {
      ...signalSafety(
        experience.ranking.source === "ml_batch"
          ? "verified_promoted_batch_model"
          : "deterministic_fallback",
      ),
      privateAccountData: true,
      ownerIdentityIncluded: false,
    },
  };
}

export async function getAccountPredictRecommendation(ownerId: string) {
  const recommendation = derivePredictRecommendation(
    await accountPreferences(ownerId),
  );
  return {
    recommendation,
    provenance: "derived_from_authenticated_user_preferences",
    asOf: new Date().toISOString(),
    safety: {
      scenarioOnly: true,
      financialAdvice: false,
      requestTimeTraining: false,
    },
  };
}

function signalSafety(method: string) {
  return {
    method,
    financialAdvice: false,
    probabilityOfProfit: false,
    requestTimeTraining: false,
    privateModelInternalsIncluded: false,
    operatorEvaluationDataIncluded: false,
  };
}
