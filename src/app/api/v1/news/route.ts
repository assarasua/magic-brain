import type { NextRequest } from "next/server";
import { listMarketBriefs } from "@/lib/market-news";
import { assertOnlyParameters, parseInteger } from "@/lib/public-api/core";
import { publicApiHandler, publicOptions } from "@/lib/public-api/http";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return publicApiHandler(request, "latest", async () => {
    const params = request.nextUrl.searchParams;
    assertOnlyParameters(params, ["limit"]);
    const limit = parseInteger(params.get("limit"), "limit", {
      defaultValue: 10,
      min: 1,
      max: 30,
    });
    return { data: await listMarketBriefs(limit) };
  });
}

export const OPTIONS = publicOptions;
