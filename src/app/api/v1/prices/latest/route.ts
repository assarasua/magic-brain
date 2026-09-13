import type { NextRequest } from "next/server";
import { ApiError } from "@/lib/public-api/core";
import { getLatestPublicPrices } from "@/lib/public-api/data";
import { publicApiHandler, publicOptions } from "@/lib/public-api/http";

export const runtime = "nodejs";

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  return publicApiHandler(request, "latest", async () => {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 32_768) {
      throw new ApiError(413, "payload_too_large", "Request body is too large");
    }
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ApiError(400, "invalid_json", "Request body must be valid JSON");
    }
    if (
      typeof body !== "object" ||
      body === null ||
      Array.isArray(body) ||
      Object.keys(body).some((key) => key !== "cardIds")
    ) {
      throw new ApiError(
        400,
        "invalid_body",
        "Request body must contain only cardIds",
      );
    }
    const cardIds = (body as { cardIds?: unknown }).cardIds;
    if (
      !Array.isArray(cardIds) ||
      cardIds.length < 1 ||
      cardIds.length > 100 ||
      cardIds.some((id) => typeof id !== "string" || !uuid.test(id))
    ) {
      throw new ApiError(
        400,
        "invalid_card_ids",
        "cardIds must contain 1 to 100 UUIDs",
      );
    }
    const uniqueIds = [...new Set(cardIds as string[])];
    const prices = await getLatestPublicPrices(uniqueIds);
    return {
      data: {
        prices,
        missingCardIds: uniqueIds.filter(
          (id) => !prices.some((item) => item.cardId === id),
        ),
      },
    };
  });
}

export const OPTIONS = publicOptions;
