import { NextRequest, NextResponse } from "next/server";
import { addPortfolioItem, getPortfolio } from "@/lib/portfolio";
import { isCardLanguage } from "@/lib/card-languages";
import {
  isValidPortfolioQuantity,
  isValidPortfolioUnitPrice,
} from "@/lib/portfolio-model";
import {
  getMlExperienceForCards,
  getPersonalizedBatchSignals,
  unavailableMlExperience,
} from "@/lib/ml-serving";
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
    const portfolio = await getPortfolio(user.id);
    const [experience, candidates] = await Promise.all([
      getMlExperienceForCards(
        user.id,
        portfolio.holdings.map((holding) => holding.cardId),
      ).catch(unavailableMlExperience),
      getPersonalizedBatchSignals(user.id, user.preferences, 8).catch(() => ({
        signals: [],
        ranking: unavailableMlExperience().ranking,
      })),
    ]);
    const heldIds = new Set(portfolio.holdings.map((holding) => holding.cardId));
    return attachSessionCookie(
      NextResponse.json({
        ...portfolio,
        holdings: portfolio.holdings.map((holding) => ({
          ...holding,
          ml: experience.scores[holding.cardId] ?? null,
        })),
        mlIntelligence: {
          ranking: candidates.ranking.source === "ml_batch"
            ? candidates.ranking
            : experience.ranking,
          candidateAdditions: candidates.signals
            .filter((candidate) => !heldIds.has(candidate.id))
            .slice(0, 3),
          coolingHoldings: portfolio.holdings
            .filter((holding) => holding.opportunityClassification === "lost_momentum")
            .slice(0, 3)
            .map((holding) => ({
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

    await addPortfolioItem(user.id, {
      cardId: record.cardId,
      quantity: record.quantity,
      purchasePrice: record.purchasePrice,
      condition:
        typeof record.condition === "string"
          ? record.condition
          : "near_mint",
      language: isCardLanguage(record.language) ? record.language : "en",
      acquiredAt,
    });

    return attachSessionCookie(
      NextResponse.json(await getPortfolio(user.id), { status: 201 }),
      newToken,
    );
  } catch {
    return NextResponse.json(
      { error: "Unable to add portfolio item" },
      { status: 500 },
    );
  }
}
