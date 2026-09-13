import type { NextRequest } from "next/server";
import { getLatestSetWatch } from "@/lib/latest-set-watch";
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
    assertOnlyParameters(params, ["set", "minimum_confidence", "limit"]);
    const setCode = params.get("set")?.trim().toLowerCase() || undefined;
    if (setCode && !/^[a-z0-9]{2,8}$/.test(setCode)) {
      throw new ApiError(400, "invalid_parameter", "set must be a valid set code");
    }
    const minimumConfidence = Number(params.get("minimum_confidence") ?? "0");
    if (
      !Number.isFinite(minimumConfidence) ||
      minimumConfidence < 0 ||
      minimumConfidence > 1
    ) {
      throw new ApiError(
        400,
        "invalid_parameter",
        "minimum_confidence must be between 0 and 1",
      );
    }
    const limit = parseInteger(params.get("limit"), "limit", {
      defaultValue: 10,
      min: 1,
      max: 25,
    });
    const result = await getLatestSetWatch(setCode);
    if (!result.set) {
      throw new ApiError(404, "not_found", "No eligible set was found");
    }
    const confidenceValue = { low: 0.34, medium: 0.67, high: 1 } as const;
    const opportunities = result.picks
      .filter((pick) => confidenceValue[pick.score.confidence] >= minimumConfidence)
      .slice(0, limit)
      .map((pick) => ({
        ...pick,
        latestPrice: {
          amount: pick.card.price,
          currency: "EUR",
          finish: "nonfoil",
          source: "mtgjson",
          observedAt: pick.card.priceDate,
        },
      }));
    return {
      data: {
        set: result.set,
        asOf: result.asOf,
        opportunities,
        methodology: result.methodology,
      },
    };
  });
}

export const OPTIONS = publicOptions;
