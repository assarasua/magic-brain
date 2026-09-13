import { createHash, randomBytes } from "node:crypto";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import { ApiError } from "./core";

type ApiKeyRow = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  tier: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

const mapKey = (row: ApiKeyRow) => ({
  id: row.id,
  name: row.name,
  prefix: row.prefix,
  scopes: row.scopes,
  tier: row.tier,
  createdAt: row.created_at,
  lastUsedAt: row.last_used_at,
  revokedAt: row.revoked_at,
});

export async function requireAuthenticatedUserId() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new ApiError(401, "authentication_required", "Sign in is required");
  }
  const result = await query<{ id: string }>(
    `select id::text from app_users where id = $1 and authenticated_at is not null`,
    [session.user.id],
  );
  if (!result.rows[0]) {
    throw new ApiError(401, "authentication_required", "Sign in is required");
  }
  return result.rows[0].id;
}

export async function listApiKeys(ownerId: string) {
  const result = await query<ApiKeyRow>(
    `
      select id::text, name, prefix, scopes, tier,
             created_at::text, last_used_at::text, revoked_at::text
      from app_api_keys
      where owner_id = $1
      order by created_at desc
    `,
    [ownerId],
  );
  return result.rows.map(mapKey);
}

export async function createApiKey(ownerId: string, name: string) {
  const count = await query<{ count: number }>(
    `
      select count(*)::int as count
      from app_api_keys
      where owner_id = $1 and revoked_at is null
    `,
    [ownerId],
  );
  if ((count.rows[0]?.count ?? 0) >= 10) {
    throw new ApiError(
      409,
      "api_key_limit_reached",
      "Revoke an existing key before creating another",
    );
  }

  const environment = process.env.NODE_ENV === "production" ? "live" : "test";
  const secret = `mb_${environment}_${randomBytes(32).toString("base64url")}`;
  const prefix = secret.slice(0, 16);
  const hash = createHash("sha256").update(secret).digest("hex");
  try {
    const result = await query<ApiKeyRow>(
      `
        insert into app_api_keys (owner_id, name, prefix, secret_hash)
        values ($1, $2, $3, $4)
        returning id::text, name, prefix, scopes, tier,
                  created_at::text, last_used_at::text, revoked_at::text
      `,
      [ownerId, name, prefix, hash],
    );
    return { ...mapKey(result.rows[0]), secret };
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      throw new ApiError(
        409,
        "api_key_name_exists",
        "An active API key already uses this name",
      );
    }
    throw error;
  }
}

export async function revokeApiKey(ownerId: string, id: string) {
  const result = await query<{ id: string }>(
    `
      update app_api_keys
      set revoked_at = now()
      where id = $1 and owner_id = $2 and revoked_at is null
      returning id::text
    `,
    [id, ownerId],
  );
  if (!result.rows[0]) {
    throw new ApiError(404, "not_found", "Active API key not found");
  }
  return { id: result.rows[0].id, revoked: true };
}
