import type { NextRequest } from "next/server";
import { isUuid, parseListName } from "@/lib/portfolio-list-model";
import {
  deletePortfolioList,
  getPortfolioLists,
  renamePortfolioList,
} from "@/lib/portfolio";
import { getAccountPortfolio } from "@/lib/public-api/account-data";
import { ApiError } from "@/lib/public-api/core";
import { publicApiHandler, publicOptions } from "@/lib/public-api/http";
import {
  requireConfirmedMutation,
  withIdempotency,
} from "@/lib/public-api/mutations";

export const runtime = "nodejs";

export function GET(
  request: NextRequest,
  context: RouteContext<"/api/v1/portfolio/lists/[id]">,
) {
  return publicApiHandler(
    request,
    "none",
    async (access) => {
      const { id } = await context.params;
      if (!isUuid(id)) throw new ApiError(400, "invalid_parameter", "Invalid list ID");
      return { data: await getAccountPortfolio(access.ownerId!, id) };
    },
    {
      allowAnonymous: false,
      requiredScopes: ["lists:read", "portfolio:read", "profile:read"],
    },
  );
}

export function PATCH(
  request: NextRequest,
  context: RouteContext<"/api/v1/portfolio/lists/[id]">,
) {
  return publicApiHandler(
    request,
    "none",
    async (access) => {
      const { id } = await context.params;
      if (!isUuid(id)) throw new ApiError(400, "invalid_parameter", "Invalid list ID");
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
          "portfolio.list.rename",
          { id, name },
          async () => {
            const status = await renamePortfolioList(access.ownerId!, id, name);
            if (status === "missing") {
              throw new ApiError(404, "not_found", "Portfolio list not found");
            }
            if (status === "duplicate") {
              throw new ApiError(409, "duplicate", "List name already exists");
            }
            return { lists: await getPortfolioLists(access.ownerId!) };
          },
        ),
      };
    },
    { allowAnonymous: false, requiredScopes: ["lists:write"] },
  );
}

export function DELETE(
  request: NextRequest,
  context: RouteContext<"/api/v1/portfolio/lists/[id]">,
) {
  return publicApiHandler(
    request,
    "none",
    async (access) => {
      const { id } = await context.params;
      if (!isUuid(id)) throw new ApiError(400, "invalid_parameter", "Invalid list ID");
      const body = await jsonObject(request);
      const idempotencyKey = requireConfirmedMutation(request, body);
      if (
        Object.keys(body).some(
          (key) => !["destinationListId", "confirm"].includes(key),
        ) ||
        (body.destinationListId !== undefined &&
          !isUuid(body.destinationListId))
      ) {
        throw new ApiError(400, "invalid_body", "Invalid list deletion");
      }
      const destinationListId =
        typeof body.destinationListId === "string"
          ? body.destinationListId
          : undefined;
      return {
        data: await withIdempotency(
          access.ownerId!,
          idempotencyKey,
          "portfolio.list.delete",
          { id, destinationListId },
          async () => {
            const status = await deletePortfolioList(
              access.ownerId!,
              id,
              destinationListId,
            );
            if (status === "missing") {
              throw new ApiError(404, "not_found", "Portfolio list not found");
            }
            if (status === "protected") {
              throw new ApiError(409, "protected_list", "Default or last list cannot be deleted");
            }
            if (status === "destination_required") {
              throw new ApiError(409, "destination_required", "Choose another list for existing holdings");
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
    const text = await request.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new ApiError(400, "invalid_json", "Request body must be valid JSON");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError(400, "invalid_body", "Request body must be an object");
  }
  return body as Record<string, unknown>;
}

export const OPTIONS = publicOptions;
