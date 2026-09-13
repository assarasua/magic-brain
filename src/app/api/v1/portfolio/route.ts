import type { NextRequest } from "next/server";
import { getAccountPortfolio } from "@/lib/public-api/account-data";
import { ApiError, assertOnlyParameters } from "@/lib/public-api/core";
import { publicApiHandler, publicOptions } from "@/lib/public-api/http";

export const runtime = "nodejs";

export function GET(request: NextRequest) {
  return publicApiHandler(
    request,
    "none",
    async (access) => {
      assertOnlyParameters(request.nextUrl.searchParams, ["list"]);
      const listId = request.nextUrl.searchParams.get("list") ?? undefined;
      if (
        listId &&
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(
          listId,
        )
      ) {
        throw new ApiError(400, "invalid_parameter", "list must be a UUID");
      }
      return { data: await getAccountPortfolio(access.ownerId!, listId) };
    },
    {
      allowAnonymous: false,
      requiredScopes: ["portfolio:read", "profile:read"],
    },
  );
}

export const OPTIONS = publicOptions;
