import type { NextRequest } from "next/server";
import { getMarketMovers } from "@/lib/catalog";
import { ApiError, assertOnlyParameters, parseInteger } from "@/lib/public-api/core";
import { publicApiHandler, publicOptions } from "@/lib/public-api/http";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return publicApiHandler(request, "latest", async () => {
    const params = request.nextUrl.searchParams;
    assertOnlyParameters(params, ["direction", "days", "set", "limit"]);
    const direction = params.get("direction") ?? "gainers";
    if (direction !== "gainers" && direction !== "losers") throw new ApiError(400, "invalid_parameter", "direction must be gainers or losers");
    const days = parseInteger(params.get("days"), "days", { defaultValue: 7, min: 1, max: 90 });
    if (![1, 7, 30, 90].includes(days)) throw new ApiError(400, "invalid_parameter", "days must be 1, 7, 30, or 90");
    const limit = parseInteger(params.get("limit"), "limit", { defaultValue: 20, min: 1, max: 50 });
    const setCode = params.get("set")?.trim().toLowerCase() || undefined;
    if (setCode && !/^[a-z0-9]{2,8}$/.test(setCode)) throw new ApiError(400, "invalid_parameter", "set must be a valid set code");
    const cards = await getMarketMovers(limit, direction, days, setCode);
    return { data: { cards, direction, days, limit } };
  });
}

export const OPTIONS = publicOptions;
