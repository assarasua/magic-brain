import type { NextRequest } from "next/server";
import { getSetPrediction, isGrowthTarget } from "@/lib/predict";
import {
  ApiError,
  assertOnlyParameters,
  parseInteger,
} from "@/lib/public-api/core";
import { publicApiHandler, publicOptions } from "@/lib/public-api/http";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return publicApiHandler(request, "latest", async () => {
    const params = request.nextUrl.searchParams;
    assertOnlyParameters(params, [
      "set",
      "target",
      "horizon",
      "demand",
      "scarcity",
      "reprints",
    ]);
    const setCode = params.get("set")?.trim().toLowerCase() || null;
    if (setCode && !/^[a-z0-9]{2,8}$/.test(setCode)) {
      throw new ApiError(400, "invalid_parameter", "set must be a valid set code");
    }
    const requestedTarget = params.get("target");
    if (requestedTarget && !isGrowthTarget(requestedTarget)) {
      throw new ApiError(
        400,
        "invalid_parameter",
        "target must be inflation, sp500, or extreme",
      );
    }
    const horizon = parseInteger(params.get("horizon"), "horizon", {
      defaultValue: 24,
      min: 12,
      max: 36,
    });
    if (horizon !== 12 && horizon !== 24 && horizon !== 36) {
      throw new ApiError(
        400,
        "invalid_parameter",
        "horizon must be 12, 24, or 36 months",
      );
    }
    const result = await getSetPrediction(setCode, {
      target: isGrowthTarget(requestedTarget) ? requestedTarget : "sp500",
      horizonMonths: horizon,
      demand: parseInteger(params.get("demand"), "demand", {
        defaultValue: 3,
        min: 1,
        max: 5,
      }),
      scarcity: parseInteger(params.get("scarcity"), "scarcity", {
        defaultValue: 3,
        min: 1,
        max: 5,
      }),
      reprintResilience: parseInteger(params.get("reprints"), "reprints", {
        defaultValue: 3,
        min: 1,
        max: 5,
      }),
    });
    if (!result) {
      throw new ApiError(404, "not_found", "No eligible set was found");
    }
    return { data: result };
  });
}

export const OPTIONS = publicOptions;
