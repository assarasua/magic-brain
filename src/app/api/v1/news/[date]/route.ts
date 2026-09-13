import { getMarketBrief } from "@/lib/market-news";
import {
  ApiError,
  assertOnlyParameters,
  optionalDate,
} from "@/lib/public-api/core";
import { publicApiHandler, publicOptions } from "@/lib/public-api/http";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ date: string }> },
) {
  return publicApiHandler(request, "history", async () => {
    assertOnlyParameters(new URL(request.url).searchParams, []);
    const requestedDate = optionalDate((await params).date, "date");
    if (!requestedDate) {
      throw new ApiError(400, "invalid_parameter", "date is required");
    }
    const brief = await getMarketBrief(requestedDate);
    if (!brief) {
      throw new ApiError(404, "not_found", "Market brief not found");
    }
    return { data: brief };
  });
}

export const OPTIONS = publicOptions;
