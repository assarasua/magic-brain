import { NextRequest, NextResponse } from "next/server";
import {
  consumePortfolioShareRateLimit,
  getPublicPortfolioShare,
} from "@/lib/portfolio-share";
import { isValidShareToken } from "@/lib/portfolio-share-model";

export const runtime = "nodejs";

const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  Vary: "Accept-Language",
};

const unavailable = () =>
  NextResponse.json(
    { error: "This shared portfolio is unavailable or has expired" },
    { status: 404, headers: privateHeaders },
  );

export async function GET(
  request: NextRequest,
  context: RouteContext<"/api/shared/portfolio/[token]">,
) {
  if (!await consumePortfolioShareRateLimit(request)) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: { ...privateHeaders, "Retry-After": "60" },
      },
    );
  }
  const { token } = await context.params;
  if (!isValidShareToken(token)) return unavailable();
  const portfolio = await getPublicPortfolioShare(token);
  return portfolio
    ? NextResponse.json(portfolio, { headers: privateHeaders })
    : unavailable();
}
