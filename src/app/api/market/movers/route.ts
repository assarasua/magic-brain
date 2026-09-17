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
    const days = [1, 7, 30, 90].includes(requestedDays) ? requestedDays : 7;
    const requestedLimit = Number(request.nextUrl.searchParams.get("limit") ?? 12);
    const limit = Number.isInteger(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 50)
      : 12;
    const setCode =
      request.nextUrl.searchParams.get("set")?.slice(0, 20) || undefined;
    const cards = await getMarketMovers(limit, direction, days, setCode);
    return NextResponse.json(
      { cards, direction, days, limit },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Unable to load market movers" },
      { status: 500 },
    );
  }
}
