import type { NextRequest } from "next/server";
import { isCardLanguage } from "@/lib/card-languages";
import { addPortfolioItem } from "@/lib/portfolio";
import { isUuid } from "@/lib/portfolio-list-model";
import {
  isValidPortfolioQuantity,
  isValidPortfolioUnitPrice,
} from "@/lib/portfolio-model";
import { getAccountPortfolio } from "@/lib/public-api/account-data";
import { ApiError, assertOnlyParameters } from "@/lib/public-api/core";
import { publicApiHandler, publicOptions } from "@/lib/public-api/http";
import {
  requireConfirmedMutation,
  withIdempotency,
} from "@/lib/public-api/mutations";

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

export function POST(request: NextRequest) {
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
      const allowed = new Set([
        "cardId", "quantity", "purchasePrice", "condition", "language",
        "acquiredAt", "listId", "confirm",
      ]);
      const conditions = new Set(["near_mint", "excellent", "good", "light_played"]);
      const acquiredAt = typeof record.acquiredAt === "string" ? record.acquiredAt : undefined;
      const parsedDate = acquiredAt ? Date.parse(`${acquiredAt}T00:00:00Z`) : null;
      const validDate = acquiredAt === undefined || (
        /^\d{4}-\d{2}-\d{2}$/.test(acquiredAt) &&
        Number.isFinite(parsedDate) &&
        new Date(parsedDate!).toISOString().slice(0, 10) === acquiredAt
      );
      if (
        Object.keys(record).some((key) => !allowed.has(key)) ||
        typeof record.cardId !== "string" || !isUuid(record.cardId) ||
        (record.listId !== undefined && !isUuid(record.listId)) ||
        !isValidPortfolioQuantity(record.quantity) ||
        !isValidPortfolioUnitPrice(record.purchasePrice) ||
        (record.condition !== undefined &&
          (typeof record.condition !== "string" || !conditions.has(record.condition))) ||
        (record.language !== undefined && !isCardLanguage(record.language)) ||
        !validDate
      ) {
        throw new ApiError(400, "invalid_body", "Invalid portfolio item");
      }
      const input = {
        cardId: record.cardId,
        quantity: record.quantity,
        purchasePrice: record.purchasePrice,
        condition: typeof record.condition === "string" ? record.condition : "near_mint",
        language: isCardLanguage(record.language) ? record.language : "en",
        acquiredAt,
        listId: typeof record.listId === "string" ? record.listId : undefined,
      };
      return {
        data: await withIdempotency(
          access.ownerId!,
          idempotencyKey,
          "portfolio.holding.create",
          input,
          async () => {
            if (!await addPortfolioItem(access.ownerId!, input)) {
              throw new ApiError(404, "not_found", "Portfolio list not found");
            }
            return getAccountPortfolio(access.ownerId!, input.listId);
          },
        ),
      };
    },
    { allowAnonymous: false, requiredScopes: ["portfolio:write"] },
  );
}

export const OPTIONS = publicOptions;
