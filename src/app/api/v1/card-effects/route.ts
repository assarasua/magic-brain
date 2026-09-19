import type { NextRequest } from "next/server";
import { searchCardEffects } from "@/lib/public-api/card-rules";
import { parseCardEffectsParameters } from "@/lib/public-api/card-rules-core";
import { publicApiHandler, publicOptions } from "@/lib/public-api/http";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return publicApiHandler(request, "latest", async () =>
    searchCardEffects(parseCardEffectsParameters(request.nextUrl.searchParams)),
  );
}

export const OPTIONS = publicOptions;
