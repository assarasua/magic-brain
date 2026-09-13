import type { NextRequest } from "next/server";
import { listPublicCards } from "@/lib/public-api/data";
import {
  assertOnlyParameters,
  ApiError,
  parseInteger,
} from "@/lib/public-api/core";
import { publicApiHandler, publicOptions } from "@/lib/public-api/http";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return publicApiHandler(request, "latest", async () => {
    const params = request.nextUrl.searchParams;
    assertOnlyParameters(params, [
      "limit",
      "cursor",
      "q",
      "set",
      "rarity",
      "language",
    ]);
    const text = (name: string, max: number) => {
      const value = params.get(name)?.trim() || null;
      if (value && value.length > max) {
        throw new ApiError(
          400,
          "invalid_parameter",
          `${name} must be at most ${max} characters`,
        );
      }
      return value;
    };
    const limit = parseInteger(params.get("limit"), "limit", {
      defaultValue: 50,
      min: 1,
      max: 100,
    });
    const result = await listPublicCards({
      limit,
      cursor: params.get("cursor"),
      search: text("q", 100),
      setCode: text("set", 20),
      rarity: text("rarity", 20),
      language: text("language", 10),
    });
    return {
      data: result.cards,
      pagination: { limit, nextCursor: result.nextCursor },
    };
  });
}

export const OPTIONS = publicOptions;
