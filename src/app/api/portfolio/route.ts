import { NextRequest, NextResponse } from "next/server";
import { getMarketMovers } from "@/lib/catalog";
import { addPortfolioItem, getPortfolio } from "@/lib/portfolio";
import { isCardLanguage } from "@/lib/card-languages";
import {
  isUuid,
} from "@/lib/portfolio-list-model";
import {
  isValidPortfolioQuantity,
  isValidPortfolioUnitPrice,
} from "@/lib/portfolio-model";
import {
  getMlExperienceForCards,
  getPersonalizedBatchSignals,
  unavailableMlExperience,
} from "@/lib/ml-serving";
import { buildPortfolioForecast } from "@/lib/portfolio-forecast-model";
import { buildPortfolioIntelligence } from "@/lib/portfolio-intelligence-model";
import { attachSessionCookie, getOrCreateUser } from "@/lib/session";

export const runtime = "nodejs";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  try {
    const session = await getOrCreateUser(request).catch(() => null);
    if (!session) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }
    const { user, newToken } = session;
    const listId = request.nextUrl.searchParams.get("listId") ?? undefined;
    if (listId !== undefined && !isUuid(listId)) {
      return NextResponse.json({ error: "Invalid list ID" }, { status: 400 });
    }
    const portfolio = await getPortfolio(user.id, listId);
    if (!portfolio) {
      return NextResponse.json({ error: "Portfolio list not found" }, { status: 404 });
    }
    const [experience, personalized] = await Promise.all([
      getMlExperienceForCards(
        user.id,
        portfolio.holdings.map((holding) => holding.cardId),
      ).catch(unavailableMlExperience),
      getPersonalizedBatchSignals(user.id, user.preferences, 8).catch(() => ({
        signals: [],
        ranking: unavailableMlExperience().ranking,
      })),
    ]);
    const usesVerifiedCandidates =
      personalized.ranking.source === "ml_batch" &&
      personalized.signals.length > 0;
    const candidatePool = usesVerifiedCandidates
      ? personalized.signals
      : await getMarketMovers(24, "gainers", 7).catch(() => []);
    const intelligenceRanking = usesVerifiedCandidates
      ? personalized.ranking
      : personalized.ranking.source === "deterministic"
        ? personalized.ranking
        : unavailableMlExperience().ranking;
    const intelligence = buildPortfolioIntelligence({
      holdings: portfolio.holdings,
      candidates: candidatePool,
      ranking: intelligenceRanking,
      maximumCandidatePrice: Math.min(
        user.preferences.maxCardPrice,
        user.preferences.defaultBudget * 0.45,
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
    return attachSessionCookie(
      NextResponse.json({
        ...portfolio,
        forecast,
        holdings: portfolio.holdings.map((holding) => ({
          ...holding,
          ml: experience.scores[holding.cardId] ?? null,
        })),
        mlIntelligence: {
          ranking: intelligenceRanking,
          ...intelligence,
          candidateAdditions: intelligence.candidateAdditions,
          holdingReviews: intelligence.holdingReviews.map((holding) => ({
            ...holding,
            ml: experience.scores[holding.cardId] ?? null,
          })),
        },
      }),
      newToken,
    );
  } catch {
    return NextResponse.json(
      { error: "Unable to load portfolio" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getOrCreateUser(request).catch(() => null);
    if (!session) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }
    const { user, newToken } = session;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { error: "Invalid portfolio item" },
        { status: 400 },
      );
    }

    const record = body as Record<string, unknown>;
    const allowedKeys = new Set([
      "cardId",
      "quantity",
      "purchasePrice",
      "condition",
      "language",
      "acquiredAt",
      "listId",
    ]);
    const allowedConditions = new Set([
      "near_mint",
      "excellent",
      "good",
      "light_played",
    ]);
    const acquiredAt =
      typeof record.acquiredAt === "string" ? record.acquiredAt : undefined;
    const acquiredAtTimestamp =
      acquiredAt === undefined
        ? null
        : Date.parse(`${acquiredAt}T00:00:00Z`);
    const validDate =
      acquiredAt === undefined ||
      (/^\d{4}-\d{2}-\d{2}$/.test(acquiredAt) &&
        Number.isFinite(acquiredAtTimestamp) &&
        new Date(acquiredAtTimestamp!).toISOString().slice(0, 10) ===
          acquiredAt);

    if (
      Object.keys(record).some((key) => !allowedKeys.has(key)) ||
      typeof record.cardId !== "string" ||
      !uuidPattern.test(record.cardId) ||
      (record.listId !== undefined && !isUuid(record.listId)) ||
      !isValidPortfolioQuantity(record.quantity) ||
      !isValidPortfolioUnitPrice(record.purchasePrice) ||
      (record.condition !== undefined &&
        (typeof record.condition !== "string" ||
          !allowedConditions.has(record.condition))) ||
      (record.language !== undefined && !isCardLanguage(record.language)) ||
      !validDate
    ) {
      return NextResponse.json(
        { error: "Invalid portfolio item" },
        { status: 400 },
      );
    }

    const added = await addPortfolioItem(user.id, {
      cardId: record.cardId,
      quantity: record.quantity,
      purchasePrice: record.purchasePrice,
      condition:
        typeof record.condition === "string"
          ? record.condition
          : "near_mint",
      language: isCardLanguage(record.language) ? record.language : "en",
      acquiredAt,
      listId: typeof record.listId === "string" ? record.listId : undefined,
    });
    if (!added) {
      return NextResponse.json({ error: "Portfolio list not found" }, { status: 404 });
    }

    const portfolio = await getPortfolio(
      user.id,
      typeof record.listId === "string" ? record.listId : undefined,
    );
    if (!portfolio) {
      return NextResponse.json({ error: "Portfolio list not found" }, { status: 404 });
    }
    return attachSessionCookie(
      NextResponse.json(
        {
          ...portfolio,
          forecast: buildPortfolioForecast({
            holdings: portfolio.holdings,
            history: portfolio.history,
            ranking: unavailableMlExperience().ranking,
          }),
        },
        { status: 201 },
      ),
      newToken,
    );
  } catch {
    return NextResponse.json(
      { error: "Unable to add portfolio item" },
      { status: 500 },
    );
  }
}
