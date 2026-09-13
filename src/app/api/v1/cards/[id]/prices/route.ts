import type { NextRequest } from "next/server";
import {
  ApiError,
  assertDateRange,
  assertOnlyParameters,
  optionalDate,
} from "@/lib/public-api/core";
import { getPublicCard, getPublicPriceHistory } from "@/lib/public-api/data";
import { publicApiHandler, publicOptions } from "@/lib/public-api/http";

export const runtime = "nodejs";

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return publicApiHandler(request, "history", async () => {
    const { id } = await context.params;
    if (!uuid.test(id)) {
      throw new ApiError(400, "invalid_card_id", "Card ID must be a UUID");
    }
    const params = request.nextUrl.searchParams;
    assertOnlyParameters(params, ["from", "to", "finish"]);
    const requestedTo = optionalDate(params.get("to"), "to");
    const to = requestedTo ?? isoDate(new Date());
    const defaultFrom = new Date(`${to}T00:00:00Z`);
    defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 89);
    const from = optionalDate(params.get("from"), "from") ?? isoDate(defaultFrom);
    assertDateRange(from, to);
    const finish = params.get("finish") ?? "all";
    if (!["all", "nonfoil", "foil"].includes(finish)) {
      throw new ApiError(
        400,
        "invalid_parameter",
        "finish must be all, nonfoil, or foil",
      );
    }
    if (!(await getPublicCard(id))) {
      throw new ApiError(404, "not_found", "Card not found");
    }
    const prices = await getPublicPriceHistory({
      cardId: id,
      from,
      to,
      finish: finish as "all" | "nonfoil" | "foil",
    });
    return { data: { cardId: id, from, to, prices } };
  });
}

export const OPTIONS = publicOptions;
