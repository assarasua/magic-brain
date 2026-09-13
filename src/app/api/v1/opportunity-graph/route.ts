import type { NextRequest } from "next/server";
import { getOpportunityGraph } from "@/lib/opportunity-graph";
import {
  ApiError,
  assertOnlyParameters,
  parseInteger,
} from "@/lib/public-api/core";
import { publicApiHandler, publicOptions } from "@/lib/public-api/http";

export const runtime = "nodejs";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

export function GET(request: NextRequest) {
  return publicApiHandler(request, "latest", async () => {
    const params = request.nextUrl.searchParams;
    assertOnlyParameters(params, ["q", "focus", "limit"]);
    const query = params.get("q")?.trim() || undefined;
    if (query && (query.length < 2 || query.length > 100)) {
      throw new ApiError(
        400,
        "invalid_parameter",
        "q must be between 2 and 100 characters",
      );
    }
    const focusId = params.get("focus") || undefined;
    if (focusId && !uuidPattern.test(focusId)) {
      throw new ApiError(400, "invalid_parameter", "focus must be a card UUID");
    }
    const limit = parseInteger(params.get("limit"), "limit", {
      defaultValue: 48,
      min: 12,
      max: 80,
    });
    return {
      data: await getOpportunityGraph({ limit, search: query, focusId }),
    };
  });
}

export const OPTIONS = publicOptions;
