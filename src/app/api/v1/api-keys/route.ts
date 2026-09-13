import type { NextRequest } from "next/server";
import { ApiError } from "@/lib/public-api/core";
import {
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
      Object.keys(body).some((key) => key !== "name")
    ) {
      throw new ApiError(
        400,
        "invalid_body",
        "Request body must contain only name",
      );
    }
    const name = (body as { name?: unknown }).name;
    if (typeof name !== "string" || name.trim().length < 1 || name.trim().length > 80) {
      throw new ApiError(
        400,
        "invalid_name",
        "name must be between 1 and 80 characters",
      );
    }
    return {
      data: await createApiKey(ownerId, name.trim()),
      status: 201,
    };
  });
}
