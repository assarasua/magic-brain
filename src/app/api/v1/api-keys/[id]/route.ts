import type { NextRequest } from "next/server";
import { ApiError } from "@/lib/public-api/core";
import { privateApiHandler } from "@/lib/public-api/http";
import {
  requireAuthenticatedUserId,
  revokeApiKey,
} from "@/lib/public-api/keys";

export const runtime = "nodejs";

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return privateApiHandler(request, async () => {
    const ownerId = await requireAuthenticatedUserId();
    const { id } = await context.params;
    if (!uuid.test(id)) {
      throw new ApiError(400, "invalid_api_key_id", "API key ID must be a UUID");
    }
    return { data: await revokeApiKey(ownerId, id) };
  });
}
