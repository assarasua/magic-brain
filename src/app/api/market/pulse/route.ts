import { NextRequest, NextResponse } from "next/server";
import {
  getMarketPulse,
  MARKET_PULSE_PERIODS,
  type MarketPulsePeriod,
} from "@/lib/market-pulse";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const requestedDays = Number(request.nextUrl.searchParams.get("days") ?? 7);
  if (
    !Number.isInteger(requestedDays) ||
    !MARKET_PULSE_PERIODS.includes(requestedDays as MarketPulsePeriod)
  ) {
    return NextResponse.json(
      { error: "days must be one of 1, 7, or 30" },
      { status: 400 },
    );
  }

  try {
    const pulse = await getMarketPulse(requestedDays as MarketPulsePeriod);
    return NextResponse.json(pulse, {
      headers: {
        "Cache-Control":
          "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (error) {
    console.error("Unable to load market pulse", error);
    return NextResponse.json(
      { error: "Unable to load market pulse" },
      { status: 500 },
    );
  }
}
