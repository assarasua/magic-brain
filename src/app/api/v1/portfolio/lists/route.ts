import type { NextRequest } from "next/server";
import {
  MAX_PORTFOLIO_LISTS,
  isUuid,
  parseListName,
} from "@/lib/portfolio-list-model";
import {
  createPortfolioList,
  getPortfolioLists,
  reorderPortfolioLists,
} from "@/lib/portfolio";
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
      assertOnlyParameters(request.nextUrl.searchParams, []);
      return { data: { lists: await getPortfolioLists(access.ownerId!) } };
    },
    { allowAnonymous: false, requiredScopes: ["lists:read"] },
  );
}

export function POST(request: NextRequest) {
  return publicApiHandler(
    request,
    "none",
    async (access) => {
      const body = await jsonObject(request);
      const idempotencyKey = requireConfirmedMutation(request, body);
      if (Object.keys(body).some((key) => !["name", "confirm"].includes(key))) {
        throw new ApiError(400, "invalid_body", "Unknown list field");
      }
      const name = parseListName(body.name);
      if (!name) throw new ApiError(400, "invalid_name", "Invalid list name");
      return {
        data: await withIdempotency(
          access.ownerId!,
          idempotencyKey,
          "portfolio.list.create",
          { name },
          async () => {
            const result = await createPortfolioList(access.ownerId!, name);
            if (result.status === "duplicate") {
              throw new ApiError(409, "duplicate", "List name already exists");
            }
            if (result.status === "limit") {
              throw new ApiError(
                409,
                "limit_reached",
                `Lists are limited to ${MAX_PORTFOLIO_LISTS}`,
              );
            }
            return { list: result.list };
          },
        ),
      };
    },
    { allowAnonymous: false, requiredScopes: ["lists:write"] },
  );
}

export function PATCH(request: NextRequest) {
  return publicApiHandler(
    request,
    "none",
    async (access) => {
      const body = await jsonObject(request);
      const idempotencyKey = requireConfirmedMutation(request, body);
      if (
        Object.keys(body).some(
          (key) => !["orderedIds", "confirm"].includes(key),
        ) ||
        !Array.isArray(body.orderedIds) ||
        body.orderedIds.length < 1 ||
        body.orderedIds.length > MAX_PORTFOLIO_LISTS ||
        body.orderedIds.some((id) => !isUuid(id)) ||
        new Set(body.orderedIds).size !== body.orderedIds.length
      ) {
        throw new ApiError(400, "invalid_body", "Invalid list order");
      }
      const orderedIds = body.orderedIds as string[];
      return {
        data: await withIdempotency(
          access.ownerId!,
          idempotencyKey,
          "portfolio.list.reorder",
          { orderedIds },
          async () => {
            if (!await reorderPortfolioLists(access.ownerId!, orderedIds)) {
              throw new ApiError(409, "conflict", "List order does not match");
            }
            return { lists: await getPortfolioLists(access.ownerId!) };
          },
        ),
      };
    },
    { allowAnonymous: false, requiredScopes: ["lists:write"] },
  );
}

async function jsonObject(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError(400, "invalid_json", "Request body must be valid JSON");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError(400, "invalid_body", "Request body must be an object");
  }
  return body as Record<string, unknown>;
}

export const OPTIONS = publicOptions;
