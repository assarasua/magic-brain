import type { NextRequest } from "next/server";
import {
  addWatchlistItem,
  deleteWatchlistItem,
  getWatchlist,
  updateAlertState,
} from "@/lib/watchlist";
import { ApiError, assertOnlyParameters } from "@/lib/public-api/core";
import { publicApiHandler, publicOptions } from "@/lib/public-api/http";
import {
  requireConfirmedMutation,
  withIdempotency,
} from "@/lib/public-api/mutations";

export const runtime = "nodejs";
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function GET(request: NextRequest) {
  return publicApiHandler(
    request,
    "none",
    async (access) => {
      assertOnlyParameters(request.nextUrl.searchParams, []);
      return { data: { cards: await getWatchlist(access.ownerId!) } };
    },
    { allowAnonymous: false, requiredScopes: ["alerts:manage"] },
  );
}

export function POST(request: NextRequest) {
  return mutation(request, "alerts.upsert", async (ownerId, body) => {
    assertFields(body, [
      "cardId",
      "targetPrice",
      "alertBelowEnabled",
      "alertAbovePrice",
      "alertAboveEnabled",
    ]);
    const cardId = card(body.cardId);
    for (const value of [body.targetPrice, body.alertAbovePrice]) {
      if (
        value !== null &&
        value !== undefined &&
        (!Number.isFinite(Number(value)) || Number(value) < 0)
      ) {
        throw new ApiError(400, "invalid_body", "Invalid alert price");
      }
    }
    await addWatchlistItem(ownerId, cardId, {
      ...("targetPrice" in body && {
        targetPrice: body.targetPrice === null ? null : Number(body.targetPrice),
      }),
      ...("alertBelowEnabled" in body && {
        alertBelowEnabled: body.alertBelowEnabled === true,
      }),
      ...("alertAbovePrice" in body && {
        alertAbovePrice:
          body.alertAbovePrice === null ? null : Number(body.alertAbovePrice),
      }),
      ...("alertAboveEnabled" in body && {
        alertAboveEnabled: body.alertAboveEnabled === true,
      }),
    });
    return { cards: await getWatchlist(ownerId) };
  });
}

export function PATCH(request: NextRequest) {
  return mutation(request, "alerts.state", async (ownerId, body) => {
    assertFields(body, ["cardId", "direction", "action"]);
    const cardId = card(body.cardId);
    if (body.direction !== "below" && body.direction !== "above") {
      throw new ApiError(400, "invalid_body", "Invalid alert direction");
    }
    if (body.action !== "dismiss" && body.action !== "reset") {
      throw new ApiError(400, "invalid_body", "Invalid alert action");
    }
    await updateAlertState(ownerId, cardId, body.direction, body.action);
    return { cards: await getWatchlist(ownerId, false) };
  });
}

export function DELETE(request: NextRequest) {
  return mutation(request, "alerts.delete", async (ownerId, body) => {
    assertFields(body, ["cardId"]);
    await deleteWatchlistItem(ownerId, card(body.cardId));
    return { cards: await getWatchlist(ownerId) };
  });
}

function mutation(
  request: NextRequest,
  operation: string,
  execute: (
    ownerId: string,
    body: Record<string, unknown>,
  ) => Promise<unknown>,
) {
  return publicApiHandler(
    request,
    "none",
    async (access) => {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        throw new ApiError(400, "invalid_json", "Request body must be valid JSON");
      }
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new ApiError(400, "invalid_body", "Request body must be an object");
      }
      const record = body as Record<string, unknown>;
      const idempotencyKey = requireConfirmedMutation(request, record);
      const input = { ...record };
      delete input.confirm;
      return {
        data: await withIdempotency(
          access.ownerId!,
          idempotencyKey,
          operation,
          input,
          () => execute(access.ownerId!, input),
        ),
      };
    },
    { allowAnonymous: false, requiredScopes: ["alerts:manage"] },
  );
}

function card(value: unknown) {
  if (typeof value !== "string" || !uuidPattern.test(value)) {
    throw new ApiError(400, "invalid_body", "Invalid card ID");
  }
  return value;
}

function assertFields(body: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(body).some((key) => !allowed.includes(key))) {
    throw new ApiError(400, "invalid_body", "Unknown alert field");
  }
}

export const OPTIONS = publicOptions;
