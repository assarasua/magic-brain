import { NextRequest, NextResponse } from "next/server";
import { getMarketMovers } from "@/lib/catalog";
import { attachSessionCookie, getOrCreateUser } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { newToken } = await getOrCreateUser(request);

    const requestedDays = Number(request.nextUrl.searchParams.get("days") ?? 30);
    const days = [7, 30, 90].includes(requestedDays) ? requestedDays : 30;
    const [gainers, losers] = await Promise.all([
      getMarketMovers(6, "gainers", days),
      getMarketMovers(4, "losers", days),
    ]);

    return attachSessionCookie(
      NextResponse.json({
        generatedAt: new Date().toISOString(),
        days,
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
