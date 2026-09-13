import { NextRequest, NextResponse } from "next/server";
import { getMarketMovers } from "@/lib/catalog";
import {
  getPersonalizedBatchSignals,
  mlExperimentAssignment,
} from "@/lib/ml-serving";
import { recordMlServingDecision } from "@/lib/ml-serving-telemetry";
import { attachSessionCookie, getOrCreateUser } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { user, newToken } = await getOrCreateUser(request);

    const requestedDays = Number(request.nextUrl.searchParams.get("days") ?? 30);
    const days = [7, 30, 90].includes(requestedDays) ? requestedDays : 30;
    const personalized = await getPersonalizedBatchSignals(
      user.id,
      user.preferences,
    ).catch(() => {
      const assignment = mlExperimentAssignment(user.id);
      return {
        signals: [],
        ranking: {
          source: "deterministic" as const,
          cohort: assignment.enabled
            ? "ml" as const
            : assignment.reason === "experiment_off"
              ? "off" as const
              : "control" as const,
          reason: assignment.enabled
            ? "scores_missing_or_stale" as const
            : assignment.reason,
          modelVersion: null,
          scoreDate: null,
          scoreGeneratedAt: null,
        },
      };
    });
    if (personalized.signals.length) {
      await recordMlServingDecision(user.id, personalized.ranking).catch(
        () => undefined,
      );
      return attachSessionCookie(
        NextResponse.json({
          generatedAt: new Date().toISOString(),
          days,
          signals: personalized.signals,
          ranking: personalized.ranking,
        }),
        newToken,
      );
    }
    const [gainers, losers] = await Promise.all([
      getMarketMovers(6, "gainers", days),
      getMarketMovers(4, "losers", days),
    ]);
    await recordMlServingDecision(user.id, personalized.ranking).catch(
      () => undefined,
    );

    return attachSessionCookie(
      NextResponse.json({
        generatedAt: new Date().toISOString(),
        days,
        signals: [
          ...gainers.map((card) => ({ ...card, direction: "up" as const })),
          ...losers.map((card) => ({ ...card, direction: "down" as const })),
        ],
        ranking: personalized.ranking,
      }),
      newToken,
    );
  } catch {
    return NextResponse.json(
      { error: "Brain Signals is temporarily unavailable" },
      { status: 500 },
    );
  }
}
