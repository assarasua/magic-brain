import type { NextRequest } from "next/server";
import {
  ApiError,
  assertOnlyParameters,
  parseInteger,
} from "@/lib/public-api/core";
import { listPublicSets } from "@/lib/public-api/data";
import { publicApiHandler, publicOptions } from "@/lib/public-api/http";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return publicApiHandler(request, "metadata", async () => {
    const params = request.nextUrl.searchParams;
    assertOnlyParameters(params, ["limit", "cursor", "q", "tabletop"]);
    const limit = parseInteger(params.get("limit"), "limit", {
      defaultValue: 50,
      min: 1,
      max: 100,
    });
    const tabletopValue = params.get("tabletop");
    const search = params.get("q")?.trim() || null;
    if (search && search.length > 80) {
      throw new ApiError(400, "invalid_parameter", "q must be at most 80 characters");
    }
    if (
      tabletopValue !== null &&
      tabletopValue !== "true" &&
      tabletopValue !== "false"
    ) {
      throw new ApiError(
        400,
        "invalid_parameter",
        "tabletop must be true or false",
      );
    }
    const result = await listPublicSets({
      limit,
      cursor: params.get("cursor"),
      search,
      tabletop:
        tabletopValue === null ? null : tabletopValue === "true",
    });
    return {
      data: result.sets,
      pagination: { limit, nextCursor: result.nextCursor },
    };
  });
}

export const OPTIONS = publicOptions;
