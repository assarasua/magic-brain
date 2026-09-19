import type { NextRequest } from "next/server";
import { getCardRules } from "@/lib/public-api/card-rules";
import { parseCardRulesParameters } from "@/lib/public-api/card-rules-core";
import { publicApiHandler, publicOptions } from "@/lib/public-api/http";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return publicApiHandler(request, "latest", async () => {
    const { card } = parseCardRulesParameters(request.nextUrl.searchParams);
    return { data: await getCardRules(card) };
  });
}

export const OPTIONS = publicOptions;
