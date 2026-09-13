import type { NextRequest } from "next/server";
import { ApiError } from "@/lib/public-api/core";
import { getPublicCard } from "@/lib/public-api/data";
import { publicApiHandler, publicOptions } from "@/lib/public-api/http";

export const runtime = "nodejs";

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return publicApiHandler(request, "latest", async () => {
    const { id } = await context.params;
    if (!uuid.test(id)) {
      throw new ApiError(400, "invalid_card_id", "Card ID must be a UUID");
    }
    const card = await getPublicCard(id);
    if (!card) throw new ApiError(404, "not_found", "Card not found");
    return { data: card };
  });
}

export const OPTIONS = publicOptions;
