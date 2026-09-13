import type { NextRequest } from "next/server";
import { isUuid, parsePortfolioBulkRequest } from "@/lib/portfolio-list-model";
import { bulkManagePortfolio } from "@/lib/portfolio";
import { ApiError } from "@/lib/public-api/core";
import { publicApiHandler, publicOptions } from "@/lib/public-api/http";
import { requireConfirmedMutation } from "@/lib/public-api/mutations";

export const runtime = "nodejs";

export function POST(request: NextRequest) {
  return publicApiHandler(
    request,
    "none",
    async (access) => {
      let body: unknown;
      try {
        const text = await request.text();
        if (text.length > 20_000) {
          throw new ApiError(413, "payload_too_large", "Bulk request is too large");
        }
        body = JSON.parse(text);
      } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError(400, "invalid_json", "Request body must be valid JSON");
      }
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new ApiError(400, "invalid_body", "Invalid bulk request");
      }
      const record = body as Record<string, unknown>;
      const idempotencyKey = requireConfirmedMutation(request, record);
      if (!isUuid(idempotencyKey)) {
        throw new ApiError(
          400,
          "invalid_idempotency_key",
          "Bulk Idempotency-Key must be a UUID",
        );
      }
      const payload = { ...record };
      delete payload.confirm;
      delete payload.requestId;
      const parsed = parsePortfolioBulkRequest({
        ...payload,
        requestId: idempotencyKey,
      });
      if (!parsed) {
        throw new ApiError(400, "invalid_body", "Invalid bulk request");
      }
      const outcome = await bulkManagePortfolio(access.ownerId!, parsed);
      return { data: outcomeData(outcome) };
    },
    {
      allowAnonymous: false,
      requiredScopes: ["portfolio:write", "lists:write"],
    },
  );
}

function outcomeData(
  outcome: Awaited<ReturnType<typeof bulkManagePortfolio>>,
) {
  if (
    outcome.status === "source_list_missing" ||
    outcome.status === "destination_missing"
  ) {
    throw new ApiError(404, "not_found", "Portfolio list not found");
  }
  if (outcome.status === "holdings_missing") {
    throw new ApiError(
      409,
      "holdings_changed",
      "Some selected holdings changed or no longer exist",
    );
  }
  if (outcome.status === "invalid_destination") {
    throw new ApiError(
      409,
      "invalid_destination",
      "Destination must differ from the source list",
    );
  }
  if (outcome.status === "conflict") {
    throw new ApiError(
      409,
      "idempotency_conflict",
      "Idempotency key was already used for another action",
    );
  }
  return outcome.result;
}

export const OPTIONS = publicOptions;
