import type { NextRequest } from "next/server";
import { ApiError } from "@/lib/public-api/core";
import {
  API_KEY_SCOPES,
  type ApiKeyScope,
  createApiKey,
  listApiKeys,
  requireAuthenticatedUserId,
} from "@/lib/public-api/keys";
import { privateApiHandler } from "@/lib/public-api/http";

export const runtime = "nodejs";

export function GET(request: NextRequest) {
  return privateApiHandler(request, async () => {
    const ownerId = await requireAuthenticatedUserId();
    return { data: await listApiKeys(ownerId) };
  });
}

export function POST(request: NextRequest) {
  return privateApiHandler(request, async () => {
    const ownerId = await requireAuthenticatedUserId();
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
      Object.keys(body).some((key) => !["name", "scopes"].includes(key))
    ) {
      throw new ApiError(
        400,
        "invalid_body",
        "Request body may contain only name and scopes",
      );
    }
    const name = (body as { name?: unknown }).name;
    const requestedScopes = (body as { scopes?: unknown }).scopes;
    if (typeof name !== "string" || name.trim().length < 1 || name.trim().length > 80) {
      throw new ApiError(
        400,
        "invalid_name",
        "name must be between 1 and 80 characters",
      );
    }
    const scopes =
      requestedScopes === undefined
        ? ["data:read"]
        : requestedScopes;
    if (
      !Array.isArray(scopes) ||
      scopes.length < 1 ||
      scopes.some(
        (scope) =>
          typeof scope !== "string" ||
          !API_KEY_SCOPES.includes(scope as ApiKeyScope),
      ) ||
      new Set(scopes).size !== scopes.length ||
      !scopes.includes("data:read")
    ) {
      throw new ApiError(
        400,
        "invalid_scopes",
        "scopes must be unique supported scopes and include data:read",
      );
    }
    return {
      data: await createApiKey(ownerId, name.trim(), scopes as ApiKeyScope[]),
      status: 201,
    };
  });
}
