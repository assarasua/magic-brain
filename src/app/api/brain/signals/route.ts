import { NextRequest, NextResponse } from "next/server";
import { getMarketMovers } from "@/lib/catalog";
import { attachSessionCookie, getOrCreateUser, isPro } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { user, newToken } = await getOrCreateUser(request);
    if (!isPro(user)) {
      return attachSessionCookie(
        NextResponse.json(
          { error: "Brain Signals requires Brain Pro" },
          { status: 403 },
        ),
        newToken,
      );
    }

    const [gainers, losers] = await Promise.all([
      getMarketMovers(6, "gainers", 7),
      getMarketMovers(4, "losers", 7),
    ]);

    return attachSessionCookie(
      NextResponse.json({
        generatedAt: new Date().toISOString(),
        signals: [
          ...gainers.map((card) => ({ ...card, direction: "up" as const })),
          ...losers.map((card) => ({ ...card, direction: "down" as const })),
        ],
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
