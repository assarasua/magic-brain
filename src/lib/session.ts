import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import { normalizeUserPreferences, type UserPreferences } from "@/lib/user-preferences";

export const SESSION_COOKIE_NAME = "magic_brain_session";

export type AppUser = {
  id: string;
  locale: "en" | "es";
  subscriptionStatus: string;
  stripeCustomerId: string | null;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  authenticated: boolean;
  productTourCompleted: boolean;
  preferences: UserPreferences;
};

type UserRow = {
  id: string;
  locale: "en" | "es";
  subscription_status: string;
  stripe_customer_id: string | null;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  authenticated_at: string | null;
  product_tour_completed: boolean;
  preferences: unknown;
};

const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

const mapUser = (row: UserRow): AppUser => ({
  id: row.id,
  locale: row.locale,
  subscriptionStatus: row.subscription_status,
  stripeCustomerId: row.stripe_customer_id,
  email: row.email,
  displayName: row.display_name,
  avatarUrl: row.avatar_url,
  authenticated: row.authenticated_at !== null,
  productTourCompleted: row.product_tour_completed,
  preferences: normalizeUserPreferences(row.preferences),
});

const userFields = `
  id, locale, subscription_status, stripe_customer_id,
  email, display_name, avatar_url, authenticated_at,
  product_tour_completed, preferences
`;

export async function getOrCreateUser(request: NextRequest) {
  const existingToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (existingToken) {
    const result = await query<UserRow>(
      `select ${userFields}
       from app_users where session_token_hash = $1`,
      [hashToken(existingToken)],
    );
    if (result.rows[0]) {
      return { user: mapUser(result.rows[0]), newToken: null };
    }
  }

  const authSession = await auth();
  if (authSession?.user?.id) {
    const result = await query<UserRow>(
      `select ${userFields} from app_users where id = $1`,
      [authSession.user.id],
    );
    if (result.rows[0]) {
      return { user: mapUser(result.rows[0]), newToken: null };
    }
  }

  const token = randomBytes(32).toString("base64url");
  const result = await query<UserRow>(
    `insert into app_users (session_token_hash)
     values ($1)
     returning ${userFields}`,
    [hashToken(token)],
  );

  return { user: mapUser(result.rows[0]), newToken: token };
}

export function attachSessionCookie(
  response: NextResponse,
  token: string | null,
) {
  if (!token) return response;

  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}

export const isPro = (user: AppUser) =>
  ["active", "trialing"].includes(user.subscriptionStatus);
