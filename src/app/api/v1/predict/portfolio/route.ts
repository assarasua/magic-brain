import type { NextRequest } from "next/server";
import { getLatestSetWatch } from "@/lib/latest-set-watch";
import {
  buildPredictPortfolioScenario,
  type PredictPortfolioRisk,
} from "@/lib/predict-portfolio-model";
import { ApiError } from "@/lib/public-api/core";
import { publicApiHandler, publicOptions } from "@/lib/public-api/http";

export const runtime = "nodejs";

const risks = new Set<PredictPortfolioRisk>([
  "preservation",
  "conservative",
  "balanced",
  "growth",
  "aggressive",
]);
const allowedFields = new Set(["setCode", "budget", "risk", "maxPositions"]);

export async function POST(request: NextRequest) {
  return publicApiHandler(request, "none", async () => {
    const parsedBody = (await request.json()) as unknown;
    if (
      parsedBody === null ||
      typeof parsedBody !== "object" ||
      Array.isArray(parsedBody)
    ) {
      throw new ApiError(
        400,
        "invalid_parameter",
        "Request body must be a JSON object",
      );
    }
    const body = parsedBody as Record<string, unknown>;
    for (const field of Object.keys(body)) {
      if (!allowedFields.has(field)) {
        throw new ApiError(400, "invalid_parameter", `Unknown field: ${field}`);
      }
    }
    const setCode =
      typeof body.setCode === "string" ? body.setCode.trim().toLowerCase() : "";
    const budget = body.budget;
    const risk = body.risk;
    const maxPositions = body.maxPositions ?? 8;
    if (!/^[a-z0-9]{2,8}$/.test(setCode)) {
      throw new ApiError(
        400,
        "invalid_parameter",
        "setCode must be a valid set code",
      );
    }
    if (
      typeof budget !== "number" ||
      !Number.isFinite(budget) ||
      budget < 25 ||
      budget > 1_000_000
    ) {
      throw new ApiError(
        400,
        "invalid_parameter",
        "budget must be between 25 and 1000000",
      );
    }
    if (typeof risk !== "string" || !risks.has(risk as PredictPortfolioRisk)) {
      throw new ApiError(
        400,
        "invalid_parameter",
        "risk must be preservation, conservative, balanced, growth, or aggressive",
      );
    }
    if (
      typeof maxPositions !== "number" ||
      !Number.isInteger(maxPositions) ||
      maxPositions < 1 ||
      maxPositions > 20
    ) {
      throw new ApiError(
        400,
        "invalid_parameter",
        "maxPositions must be an integer between 1 and 20",
      );
    }

    const opportunities = await getLatestSetWatch(setCode);
    if (!opportunities.set) {
      throw new ApiError(404, "not_found", "No eligible set was found");
    }
    if (opportunities.picks.length === 0) {
      throw new ApiError(
        404,
        "not_found",
        "No priced opportunities are available for this set",
      );
    }
    return {
      data: {
        set: opportunities.set,
        asOf: opportunities.asOf,
        scenario: buildPredictPortfolioScenario(opportunities.picks, {
          budget,
          risk: risk as PredictPortfolioRisk,
          maxPositions,
        }),
        signalMethodology: opportunities.methodology,
      },
    };
  });
}

export const OPTIONS = publicOptions;
