import { NextRequest, NextResponse } from "next/server";
import { rankByVerifiedScores } from "@/lib/ml-experience";
import {
  getMlExperienceForCards,
  unavailableMlExperience,
} from "@/lib/ml-serving";
import { getSetPrediction, isGrowthTarget } from "@/lib/predict";
import { attachSessionCookie, getOrCreateUser } from "@/lib/session";

export const runtime = "nodejs";

const boundedScore = (value: string | null, fallback: number) => {
  const parsed = Number(value ?? fallback);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 5
    ? parsed
    : fallback;
};

export async function GET(request: NextRequest) {
  try {
    const { user, newToken } = await getOrCreateUser(request);
    const params = request.nextUrl.searchParams;
    const requestedTarget = params.get("target");
    const target = isGrowthTarget(requestedTarget) ? requestedTarget : "sp500";
    const requestedHorizon = Number(params.get("horizon") ?? 24);
    const horizonMonths =
      requestedHorizon === 12 || requestedHorizon === 36
        ? requestedHorizon
        : 24;
    const result = await getSetPrediction(params.get("set"), {
      target,
      horizonMonths,
      demand: boundedScore(params.get("demand"), 3),
      scarcity: boundedScore(params.get("scarcity"), 3),
      reprintResilience: boundedScore(params.get("reprints"), 3),
    });

    if (!result) {
      return NextResponse.json(
        { error: "No eligible set was found" },
        { status: 404 },
      );
    }
    const experience = await getMlExperienceForCards(
      user.id,
      result.cardPredictions.map((pick) => pick.card.id),
    ).catch(unavailableMlExperience);
    const rankedCards = rankByVerifiedScores(
      result.cardPredictions.map((pick) => ({ ...pick, id: pick.card.id })),
      experience,
    ).map((rankedPick) => {
      const { id, ...pick } = rankedPick;
      return {
        ...pick,
        ml: experience.scores[id] ?? null,
      };
    });
    return attachSessionCookie(
      NextResponse.json({
        ...result,
        cardPredictions: rankedCards,
        ranking: experience.ranking,
      }, {
        headers: { "Cache-Control": "private, max-age=60" },
      }),
      newToken,
    );
  } catch {
    return NextResponse.json(
      { error: "Unable to calculate this prediction" },
      { status: 500 },
    );
  }
}
