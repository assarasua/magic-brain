import { NextRequest, NextResponse } from "next/server";
import { getMarketMovers } from "@/lib/catalog";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const direction =
      request.nextUrl.searchParams.get("direction") === "losers"
        ? "losers"
        : "gainers";
    const requestedDays = Number(request.nextUrl.searchParams.get("days") ?? 7);
    const days = [1, 7, 30].includes(requestedDays) ? requestedDays : 7;
    const cards = await getMarketMovers(12, direction, days);
    return NextResponse.json(
      { cards, direction, days },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Unable to load market movers" },
      { status: 500 },
    );
  }
}
