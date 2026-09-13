import type { NextRequest } from "next/server";
import { isUuid } from "@/lib/portfolio-list-model";
import { revokePortfolioShare } from "@/lib/portfolio-share";
import { ApiError } from "@/lib/public-api/core";
import { publicApiHandler, publicOptions } from "@/lib/public-api/http";
import {
  requireConfirmedMutation,
  withIdempotency,
} from "@/lib/public-api/mutations";

export const runtime = "nodejs";

export function DELETE(
  request: NextRequest,
  context: RouteContext<"/api/v1/portfolio/lists/[id]/shares/[shareId]">,
) {
  return publicApiHandler(
    request,
    "none",
    async (access) => {
      const { id, shareId } = await context.params;
      if (!isUuid(id) || !isUuid(shareId)) {
        throw new ApiError(400, "invalid_parameter", "Invalid share ID");
      }
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
      const record = body as Record<string, unknown>;
      const idempotencyKey = requireConfirmedMutation(request, record);
      if (Object.keys(record).some((key) => key !== "confirm")) {
        throw new ApiError(400, "invalid_body", "Unknown share field");
      }
      return {
        data: await withIdempotency(
          access.ownerId!,
          idempotencyKey,
          "portfolio.share.revoke",
          { id, shareId },
          async () => {
            if (!await revokePortfolioShare(access.ownerId!, id, shareId)) {
              throw new ApiError(404, "not_found", "Share not found");
            }
            return { revoked: true };
          },
        ),
      };
    },
    { allowAnonymous: false, requiredScopes: ["shares:manage"] },
  );
}

export const OPTIONS = publicOptions;
