import type { NextRequest } from "next/server";
import { getAccountPredictRecommendation } from "@/lib/public-api/account-data";
import { assertOnlyParameters } from "@/lib/public-api/core";
import { publicApiHandler, publicOptions } from "@/lib/public-api/http";

export const runtime = "nodejs";

export function GET(request: NextRequest) {
  return publicApiHandler(
    request,
    "none",
    async (access) => {
      assertOnlyParameters(request.nextUrl.searchParams, []);
      return {
        data: await getAccountPredictRecommendation(access.ownerId!),
      };
    },
    { allowAnonymous: false, requiredScopes: ["profile:read"] },
  );
}

export const OPTIONS = publicOptions;
