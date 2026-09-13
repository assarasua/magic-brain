import "server-only";

import { createHash } from "node:crypto";
import { db, query } from "@/lib/db";
import {
  createShareToken,
  hashShareToken,
  MAX_ACTIVE_SHARES,
  MAX_PUBLIC_SHARE_READS_PER_MINUTE,
  MAX_SHARE_CREATIONS_PER_HOUR,
} from "@/lib/portfolio-share-model";

const hash = (value: string) => createHash("sha256").update(value).digest();

export type PortfolioShareStatus = {
  id: string;
  listId: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  active: boolean;
};

type ShareRow = {
  id: string;
  list_id: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  active: boolean;
};

const mapShare = (row: ShareRow): PortfolioShareStatus => ({
  id: row.id,
  listId: row.list_id,
  createdAt: row.created_at,
  expiresAt: row.expires_at,
  revokedAt: row.revoked_at,
  active: row.active,
});

export async function listPortfolioShares(userId: string, listId: string) {
  const owned = await query(
    `select id from app_portfolio_lists where id = $1 and user_id = $2`,
    [listId, userId],
  );
  if (owned.rowCount !== 1) return null;
  const result = await query<ShareRow>(
    `
      select id::text, list_id::text, created_at::text, expires_at::text,
        revoked_at::text,
        (revoked_at is null and expires_at > now()) as active
      from app_portfolio_list_shares
      where user_id = $1 and list_id = $2
      order by created_at desc
      limit 20
    `,
    [userId, listId],
  );
  return result.rows.map(mapShare);
}

export async function createPortfolioShare(userId: string, listId: string) {
  const client = await db.connect();
  try {
    await client.query("begin");
    await client.query(`select id from app_users where id = $1 for update`, [
      userId,
    ]);
    const owned = await client.query(
      `select id from app_portfolio_lists where id = $1 and user_id = $2`,
      [listId, userId],
    );
    if (owned.rowCount !== 1) {
      await client.query("rollback");
      return { status: "missing" as const };
    }
    const recent = await client.query<{ count: number }>(
      `
        select count(*)::integer as count
        from app_portfolio_list_shares
        where user_id = $1 and created_at > now() - interval '1 hour'
      `,
      [userId],
    );
    if (recent.rows[0].count >= MAX_SHARE_CREATIONS_PER_HOUR) {
      await client.query("rollback");
      return { status: "rate_limited" as const };
    }
    await client.query(
      `
        update app_portfolio_list_shares
        set revoked_at = now()
        where user_id = $1 and list_id = $2
          and revoked_at is null and expires_at > now()
      `,
      [userId, listId],
    );
    const active = await client.query<{ count: number }>(
      `
        select count(*)::integer as count
        from app_portfolio_list_shares
        where user_id = $1 and revoked_at is null and expires_at > now()
      `,
      [userId],
    );
    if (active.rows[0].count >= MAX_ACTIVE_SHARES) {
      await client.query("rollback");
      return { status: "limit" as const };
    }
    const token = createShareToken();
    const inserted = await client.query<ShareRow>(
      `
        with instant as (select clock_timestamp() as issued_at)
        insert into app_portfolio_list_shares (
          user_id, list_id, token_hash, created_at, expires_at
        )
        select $1, $2, $3, issued_at, issued_at + interval '24 hours'
        from instant
        returning id::text, list_id::text, created_at::text, expires_at::text,
          revoked_at::text, true as active
      `,
      [userId, listId, hash(token)],
    );
    await client.query("commit");
    return {
      status: "created" as const,
      token,
      share: mapShare(inserted.rows[0]),
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function revokePortfolioShare(
  userId: string,
  listId: string,
  shareId: string,
) {
  const result = await query(
    `
      update app_portfolio_list_shares
      set revoked_at = coalesce(revoked_at, now())
      where id = $1 and list_id = $2 and user_id = $3
      returning id
    `,
    [shareId, listId, userId],
  );
  return result.rowCount === 1;
}

function publicClientIdentifier(request: Request) {
  const ip =
    request.headers.get("cf-connecting-ip")?.trim() ||
    (process.env.NODE_ENV !== "production"
      ? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      : null) ||
    "unknown";
  return hash(`portfolio-share:${ip}`);
}

export async function consumePortfolioShareRateLimit(request: Request) {
  const result = await query<{ request_count: number }>(
    `
      insert into app_portfolio_share_rate_limits (
        identifier_hash, window_start, request_count
      )
      values ($1, date_trunc('minute', now()), 1)
      on conflict (identifier_hash, window_start) do update
      set request_count = app_portfolio_share_rate_limits.request_count + 1
      where app_portfolio_share_rate_limits.request_count < $2
      returning request_count
    `,
    [publicClientIdentifier(request), MAX_PUBLIC_SHARE_READS_PER_MINUTE],
  );
  return result.rowCount === 1;
}

type PublicHoldingRow = {
  name: string;
  set_code: string;
  set_name: string;
  collector_number: string;
  image_url: string | null;
  quantity: number;
  current_price: string | null;
};

export async function getPublicPortfolioShare(token: string) {
  const tokenHash = hashShareToken(token);
  if (!tokenHash) return null;
  const share = await query<{
    list_id: string;
    name: string;
    expires_at: string;
  }>(
    `
      select share.list_id::text, list.name, share.expires_at::text
      from app_portfolio_list_shares share
      join app_portfolio_lists list
        on list.id = share.list_id and list.user_id = share.user_id
      where share.token_hash = $1
        and share.revoked_at is null
        and share.expires_at > now()
      limit 1
    `,
    [tokenHash],
  );
  if (!share.rows[0]) return null;
  const holdings = await query<PublicHoldingRow>(
    `
      select c.name, c.set_code, c.set_name, c.collector_number,
        coalesce(c.image_url, c.image_uris->>'normal') as image_url,
        item.quantity, latest.eur as current_price
      from app_portfolio_items item
      join cards c on c.scryfall_id = item.scryfall_id
      left join lateral (
        select eur from prices
        where scryfall_id = item.scryfall_id and source = 'mtgjson'
        order by date desc limit 1
      ) latest on true
      where item.list_id = $1
      order by (latest.eur * item.quantity) desc nulls last, c.name
    `,
    [share.rows[0].list_id],
  );
  const publicHoldings = holdings.rows.map((holding) => ({
    name: holding.name,
    setCode: holding.set_code,
    setName: holding.set_name,
    collectorNumber: holding.collector_number,
    imageUrl: holding.image_url,
    quantity: holding.quantity,
    currentPrice:
      holding.current_price === null ? null : Number(holding.current_price),
    currentValue:
      holding.current_price === null
        ? null
        : Number(holding.current_price) * holding.quantity,
  }));
  return {
    name: share.rows[0].name,
    expiresAt: share.rows[0].expires_at,
    holdings: publicHoldings,
    summary: {
      cardCount: publicHoldings.reduce(
        (total, holding) => total + holding.quantity,
        0,
      ),
      holdingCount: publicHoldings.length,
      pricedHoldings: publicHoldings.filter(
        (holding) => holding.currentValue !== null,
      ).length,
      currentValue: publicHoldings.reduce(
        (total, holding) => total + (holding.currentValue ?? 0),
        0,
      ),
    },
  };
}
