import type { NextRequest } from "next/server";
import {
  consumePortfolioShareRateLimit,
  getPublicPortfolioShare,
} from "@/lib/portfolio-share";
import { ApiError } from "@/lib/public-api/core";
import { publicApiHandler, publicOptions } from "@/lib/public-api/http";

export const runtime = "nodejs";

export function GET(
  request: NextRequest,
  context: RouteContext<"/api/v1/shared/portfolio/[token]">,
) {
  return publicApiHandler(request, "none", async () => {
    if (!await consumePortfolioShareRateLimit(request)) {
      throw new ApiError(429, "rate_limit_exceeded", "Too many share requests");
    }
    const { token } = await context.params;
    const share = await getPublicPortfolioShare(token);
    if (!share) {
      throw new ApiError(404, "not_found", "Share not found or expired");
    }
    return { data: share };
  });
}

export const OPTIONS = publicOptions;
