import type { NextRequest } from "next/server";
import { isUuid } from "@/lib/portfolio-list-model";
import {
  createPortfolioShare,
  listPortfolioShares,
} from "@/lib/portfolio-share";
import { ApiError } from "@/lib/public-api/core";
import { publicApiHandler, publicOptions } from "@/lib/public-api/http";
import {
  requireConfirmedMutation,
} from "@/lib/public-api/mutations";

export const runtime = "nodejs";

export function GET(
  request: NextRequest,
  context: RouteContext<"/api/v1/portfolio/lists/[id]/shares">,
) {
  return publicApiHandler(
    request,
    "none",
    async (access) => {
      const { id } = await context.params;
      if (!isUuid(id)) throw new ApiError(400, "invalid_parameter", "Invalid list ID");
      const shares = await listPortfolioShares(access.ownerId!, id);
      if (!shares) throw new ApiError(404, "not_found", "Portfolio list not found");
      return { data: { shares } };
    },
    { allowAnonymous: false, requiredScopes: ["shares:manage"] },
  );
}

export function POST(
  request: NextRequest,
  context: RouteContext<"/api/v1/portfolio/lists/[id]/shares">,
) {
  return publicApiHandler(
    request,
    "none",
    async (access) => {
      const { id } = await context.params;
      if (!isUuid(id)) throw new ApiError(400, "invalid_parameter", "Invalid list ID");
      const body = await jsonObject(request);
      const idempotencyKey = requireConfirmedMutation(request, body);
      if (Object.keys(body).some((key) => key !== "confirm")) {
        throw new ApiError(400, "invalid_body", "Unknown share field");
      }
      return {
        data: await createShare(access.ownerId!, id, idempotencyKey, request.url),
      };
    },
    { allowAnonymous: false, requiredScopes: ["shares:manage"] },
  );
}

async function createShare(
  ownerId: string,
  listId: string,
  idempotencyKey: string,
  requestUrl: string,
) {
  const result = await createPortfolioShare(ownerId, listId, idempotencyKey);
  if (result.status === "missing") {
    throw new ApiError(404, "not_found", "Portfolio list not found");
  }
  if (result.status === "rate_limited") {
    throw new ApiError(429, "rate_limit_exceeded", "Share creation limit reached");
  }
  if (result.status === "limit") {
    throw new ApiError(409, "limit_reached", "Active share limit reached");
  }
  if (result.status === "conflict") {
    throw new ApiError(
      409,
      "idempotency_conflict",
      "Idempotency key was already used for another share",
    );
  }
  return {
    share: result.share,
    url: `${new URL(requestUrl).origin}/shared/portfolio/${result.token}`,
    replacedPrevious: true,
  };
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
