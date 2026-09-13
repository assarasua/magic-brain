import type { NextRequest } from "next/server";
import { getAccountSignals } from "@/lib/public-api/account-data";
import {
  assertOnlyParameters,
  parseInteger,
} from "@/lib/public-api/core";
import { publicApiHandler, publicOptions } from "@/lib/public-api/http";

export const runtime = "nodejs";

export function GET(request: NextRequest) {
  return publicApiHandler(
    request,
    "none",
    async (access) => {
      const params = request.nextUrl.searchParams;
      assertOnlyParameters(params, ["limit"]);
      const limit = parseInteger(params.get("limit"), "limit", {
        defaultValue: 10,
        min: 1,
        max: 25,
      });
      return { data: await getAccountSignals(access.ownerId!, limit) };
    },
    { allowAnonymous: false, requiredScopes: ["profile:read"] },
  );
}

export const OPTIONS = publicOptions;
