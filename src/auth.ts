import { createHash, randomBytes } from "node:crypto";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { cookies } from "next/headers";
import { db, query } from "@/lib/db";

const PRODUCT_COOKIE = "magic_brain_session";
const authSecret = process.env.AUTH_SECRET;
const isProductionBuild = process.env.NEXT_PHASE === "phase-production-build";

if (process.env.NODE_ENV === "production" && !isProductionBuild && !authSecret) {
  throw new Error(
    "AUTH_SECRET is required in production; refusing to start with insecure auth configuration",
  );
}

export const googleAuthConfigured = Boolean(
  process.env.AUTH_GOOGLE_ID &&
    process.env.AUTH_GOOGLE_SECRET &&
    authSecret,
);

const providers = googleAuthConfigured
  ? [
      Google({
        clientId: process.env.AUTH_GOOGLE_ID!,
        clientSecret: process.env.AUTH_GOOGLE_SECRET!,
      }),
    ]
  : [];

async function resolveAppUser(profile: {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}) {
  if (!profile.sub || !profile.email || profile.email_verified !== true) {
    throw new Error("Google did not return a verified email address");
  }

  const cookieStore = await cookies();
  const anonymousToken = cookieStore.get(PRODUCT_COOKIE)?.value;
  const referralCode = cookieStore.get("magic_brain_referral")?.value;
  const anonymousHash = anonymousToken
    ? createHash("sha256").update(anonymousToken).digest("hex")
    : null;
  const client = await db.connect();

  try {
    await client.query("begin");
    const identityResult = await client.query<{ id: string }>(
      `
        select id from app_users
        where google_sub = $1 or lower(email) = lower($2)
        order by google_sub = $1 desc
        limit 1
        for update
      `,
      [profile.sub, profile.email],
    );
    const anonymousResult = anonymousHash
      ? await client.query<{ id: string }>(
          `select id from app_users where session_token_hash = $1 for update`,
          [anonymousHash],
        )
      : { rows: [] };

    const identityId = identityResult.rows[0]?.id;
    const anonymousId = anonymousResult.rows[0]?.id;
    let userId = identityId ?? anonymousId;

    if (identityId && anonymousId && identityId !== anonymousId) {
      await client.query(
        `
          insert into app_portfolio_lists (user_id, name, position, is_default)
          select id,
            case when locale = 'es' then 'Mi colección' else 'My collection' end,
            0, true
          from app_users
          where id = $1
            and not exists (
              select 1 from app_portfolio_lists where user_id = $1
            )
          on conflict do nothing
        `,
        [identityId],
      );
      await client.query(
        `
          update app_portfolio_items
          set user_id = $1,
              list_id = (
                select id from app_portfolio_lists
                where user_id = $1 and is_default
              ),
              updated_at = now()
          where user_id = $2
        `,
        [identityId, anonymousId],
      );
      await client.query(
        `
          insert into app_watchlist_items
            (user_id, scryfall_id, target_price_eur, created_at)
          select $1, scryfall_id, target_price_eur, created_at
          from app_watchlist_items where user_id = $2
          on conflict (user_id, scryfall_id) do update
          set target_price_eur = coalesce(
            app_watchlist_items.target_price_eur,
            excluded.target_price_eur
          )
        `,
        [identityId, anonymousId],
      );
      await client.query(
        `delete from app_watchlist_items where user_id = $1`,
        [anonymousId],
      );
      await client.query(
        `update app_brain_portfolios set user_id = $1 where user_id = $2`,
        [identityId, anonymousId],
      );
      await client.query(`delete from app_users where id = $1`, [anonymousId]);
      userId = identityId;
    }

    if (!userId) {
      const randomSessionHash = createHash("sha256")
        .update(randomBytes(32))
        .digest("hex");
      const inserted = await client.query<{ id: string }>(
        `
          insert into app_users
            (session_token_hash, google_sub, email, display_name, avatar_url,
             authenticated_at)
          values ($1, $2, $3, $4, $5, now())
          returning id
        `,
        [
          randomSessionHash,
          profile.sub,
          profile.email,
          profile.name ?? null,
          profile.picture ?? null,
        ],
      );
      userId = inserted.rows[0].id;
      if (/^[a-f0-9]{12}$/.test(referralCode ?? "")) {
        await client.query(
          `insert into app_referrals (referrer_user_id, referred_user_id)
           select id, $2 from app_users
           where referral_code = $1 and id <> $2
           on conflict (referred_user_id) do nothing`,
          [referralCode, userId],
        );
      }
    } else {
      await client.query(
        `
          update app_users
          set google_sub = $1,
              email = $2,
              display_name = $3,
              avatar_url = $4,
              authenticated_at = now(),
              updated_at = now()
          where id = $5
        `,
        [
          profile.sub,
          profile.email,
          profile.name ?? null,
          profile.picture ?? null,
          userId,
        ],
      );
    }

    await client.query("commit");
    return userId;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: authSecret,
  trustHost: true,
  providers,
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account?.provider === "google" && profile) {
        token.appUserId = await resolveAppUser(
          profile as {
            sub?: string;
            email?: string;
            email_verified?: boolean;
            name?: string;
            picture?: string;
          },
        );
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && typeof token.appUserId === "string") {
        session.user.id = token.appUserId;
        const result = await query<{
          preferences_onboarding_completed: boolean;
        }>(
          `select preferences_onboarding_completed from app_users where id = $1`,
          [token.appUserId],
        );
        session.preferencesOnboardingCompleted =
          result.rows[0]?.preferences_onboarding_completed ?? false;
      }
      return session;
    },
  },
});
