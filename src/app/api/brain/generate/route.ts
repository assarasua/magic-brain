import { NextRequest, NextResponse } from "next/server";
import { BrainPreferences, generateBrainPortfolio } from "@/lib/brain";
import { normalizeSetCodes } from "@/lib/card-filters";
import { attachSessionCookie, getOrCreateUser, isPro } from "@/lib/session";

export const runtime = "nodejs";

const risks = new Set<BrainPreferences["risk"]>([
  "preservation",
  "conservative",
  "balanced",
  "growth",
  "aggressive",
]);
const horizons = new Set<BrainPreferences["horizon"]>([
  "short",
  "medium",
  "long",
]);

export async function POST(request: NextRequest) {
  try {
    const { user, newToken } = await getOrCreateUser(request);
    if (!isPro(user)) {
      return attachSessionCookie(
        NextResponse.json(
          { error: "Portfolio generation requires Brain Pro" },
          { status: 403 },
        ),
        newToken,
      );
    }
    const body = (await request.json()) as Partial<BrainPreferences>;
    const budget = Number(body.budget);
    const maxCardPrice = Number(body.maxCardPrice);
    const positions = Number(body.positions);
    const strategy = body.strategy ?? "diversified";
    const marketTrend = body.marketTrend ?? "any";
    const releaseEra = body.releaseEra ?? "any";
    const strategies = new Set<BrainPreferences["strategy"]>([
      "diversified",
      "momentum",
      "stability",
      "collectible",
    ]);
    const marketTrends = new Set<BrainPreferences["marketTrend"]>([
      "any",
      "rising",
      "stable",
      "recovering",
    ]);
    const releaseEras = new Set<BrainPreferences["releaseEra"]>([
      "any",
      "classic",
      "established",
      "recent",
    ]);

    if (
      !Number.isFinite(budget) ||
      budget < 25 ||
      budget > 1_000_000 ||
      !body.risk ||
      !risks.has(body.risk) ||
      !body.horizon ||
      !horizons.has(body.horizon) ||
      !strategies.has(strategy) ||
      !marketTrends.has(marketTrend) ||
      !releaseEras.has(releaseEra) ||
      !Number.isFinite(maxCardPrice) ||
      maxCardPrice < 2 ||
      !Number.isInteger(positions) ||
      positions < 3 ||
      positions > 20
    ) {
      return NextResponse.json(
        { error: "Invalid investment preferences" },
        { status: 400 },
      );
    }

    const result = await generateBrainPortfolio(
      user.id,
      {
        budget,
        risk: body.risk,
        horizon: body.horizon,
        strategy,
        marketTrend,
        releaseEra,
        colors: Array.isArray(body.colors) ? body.colors.slice(0, 5) : [],
        rarities: Array.isArray(body.rarities) ? body.rarities.slice(0, 6) : [],
        cardTypes: Array.isArray(body.cardTypes)
          ? body.cardTypes.slice(0, 8)
          : [],
        setCodes: normalizeSetCodes(body.setCodes),
        maxCardPrice,
        positions,
        reservedOnly: body.reservedOnly === true,
        locale: body.locale === "es" ? "es" : "en",
      },
      true,
    );

    return attachSessionCookie(NextResponse.json(result), newToken);
  } catch {
    return NextResponse.json(
      { error: "The Brain could not generate a portfolio" },
      { status: 500 },
    );
  }
}
