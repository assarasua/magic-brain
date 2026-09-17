import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

async function userId() {
  const session = await auth();
  return session?.user?.id ?? null;
}

export async function GET() {
  const id = await userId();
  if (!id) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const client = await db.connect();
  try {
    const [account, lists, items, watchlist, referrals] = await Promise.all([
      client.query(`select id, locale, email, display_name, avatar_url, authenticated_at, subscription_status, preferences, created_at, updated_at from app_users where id = $1`, [id]),
      client.query(`select id, name, position, is_default, created_at, updated_at from app_portfolio_lists where user_id = $1 order by position`, [id]),
      client.query(`select id, list_id, scryfall_id, quantity, purchase_price_eur, condition, language, acquired_at, notes, created_at, updated_at from app_portfolio_items where user_id = $1 order by created_at`, [id]),
      client.query(`select scryfall_id, target_price_eur, created_at from app_watchlist_items where user_id = $1 order by created_at`, [id]),
      client.query(`select id, referred_user_id, created_at from app_referrals where referrer_user_id = $1 union all select id, referrer_user_id, created_at from app_referrals where referred_user_id = $1 order by created_at`, [id]),
    ]);
    return NextResponse.json({ exportedAt: new Date().toISOString(), account: account.rows[0], portfolioLists: lists.rows, portfolioItems: items.rows, watchlist: watchlist.rows, referrals: referrals.rows }, { headers: { "Content-Disposition": `attachment; filename="magic-brain-data-${new Date().toISOString().slice(0, 10)}.json"`, "Cache-Control": "no-store" } });
  } finally { client.release(); }
}

export async function DELETE(request: NextRequest) {
  const id = await userId();
  if (!id) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const body = await request.json().catch(() => null) as { confirmation?: string } | null;
  if (body?.confirmation !== "DELETE") return NextResponse.json({ error: "Type DELETE to confirm" }, { status: 400 });
  const client = await db.connect();
  try {
    await client.query(`delete from app_users where id = $1`, [id]);
  } finally {
    client.release();
  }
  const response = NextResponse.json({ ok: true });
  for (const name of ["magic_brain_session", "authjs.session-token", "__Secure-authjs.session-token"]) response.cookies.set(name, "", { path: "/", maxAge: 0 });
  return response;
}
