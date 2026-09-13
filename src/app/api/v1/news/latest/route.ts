import type { NextRequest } from "next/server";
import { materializeLatestMarketBrief } from "@/lib/market-news";
import { ApiError, assertOnlyParameters } from "@/lib/public-api/core";
import { publicApiHandler, publicOptions } from "@/lib/public-api/http";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return publicApiHandler(request, "latest", async () => {
    assertOnlyParameters(request.nextUrl.searchParams, []);
    const brief = await materializeLatestMarketBrief();
    if (!brief) {
      throw new ApiError(404, "not_found", "No market brief is available");
    }
    return { data: brief };
  });
}

export const OPTIONS = publicOptions;
