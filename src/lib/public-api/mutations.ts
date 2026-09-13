import { createHash } from "node:crypto";
import { query } from "@/lib/db";
import { ApiError } from "./core";

export function requireConfirmedMutation(
  request: Request,
  body: Record<string, unknown>,
) {
  if (body.confirm !== true) {
    throw new ApiError(
      400,
      "confirmation_required",
      "Set confirm to true after reviewing this account mutation",
    );
  }
  const idempotencyKey = request.headers.get("idempotency-key")?.trim() ?? "";
  if (
    idempotencyKey.length < 8 ||
    idempotencyKey.length > 128 ||
    !/^[A-Za-z0-9._:-]+$/.test(idempotencyKey)
  ) {
    throw new ApiError(
      400,
      "idempotency_key_required",
      "Idempotency-Key must be 8-128 safe characters",
    );
  }
  return idempotencyKey;
}

export async function withIdempotency<T>(
  ownerId: string,
  idempotencyKey: string,
  operation: string,
  input: unknown,
  execute: () => Promise<T>,
): Promise<T> {
  const requestHash = createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
  await query(
    `delete from app_public_api_idempotency
     where owner_id = $1 and idempotency_key = $2 and expires_at <= now()`,
    [ownerId, idempotencyKey],
  );
  const reservation = await query(
    `insert into app_public_api_idempotency
       (owner_id, idempotency_key, operation, request_hash)
     values ($1, $2, $3, $4)
     on conflict do nothing
     returning idempotency_key`,
    [ownerId, idempotencyKey, operation, requestHash],
  );
  if (reservation.rowCount !== 1) {
    const existing = await query<{
      operation: string;
      request_hash: string;
      response_body: T | null;
    }>(
      `select operation, request_hash, response_body
       from app_public_api_idempotency
       where owner_id = $1 and idempotency_key = $2 and expires_at > now()`,
      [ownerId, idempotencyKey],
    );
    const row = existing.rows[0];
    if (
      !row ||
      row.operation !== operation ||
      row.request_hash !== requestHash
    ) {
      throw new ApiError(
        409,
        "idempotency_conflict",
        "Idempotency key was already used for another request",
      );
    }
    if (row.response_body === null) {
      throw new ApiError(
        409,
        "request_in_progress",
        "A request with this idempotency key is still in progress",
      );
    }
    return row.response_body;
  }
  try {
    const response = await execute();
    await query(
      `update app_public_api_idempotency
       set response_body = $3::jsonb
       where owner_id = $1 and idempotency_key = $2`,
      [ownerId, idempotencyKey, JSON.stringify(response)],
    );
    return response;
  } catch (error) {
    await query(
      `delete from app_public_api_idempotency
       where owner_id = $1 and idempotency_key = $2 and response_body is null`,
      [ownerId, idempotencyKey],
    ).catch(() => undefined);
    throw error;
  }
}
