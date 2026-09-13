import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import { normalizeUserPreferences, type UserPreferences } from "@/lib/user-preferences";

export const SESSION_COOKIE_NAME = "magic_brain_session";

export type AppUser = {
  id: string;
  locale: "en" | "es";
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
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  authenticated_at: string | null;
  product_tour_completed: boolean;
  preferences: unknown;
};

const mapUser = (row: UserRow): AppUser => ({
  id: row.id,
  locale: row.locale,
  email: row.email,
  displayName: row.display_name,
  avatarUrl: row.avatar_url,
  authenticated: row.authenticated_at !== null,
  productTourCompleted: row.product_tour_completed,
  preferences: normalizeUserPreferences(row.preferences),
});

const userFields = `
  id, locale, email, display_name, avatar_url, authenticated_at,
  product_tour_completed, preferences
`;

export async function getOrCreateUser(_request: NextRequest) {
  void _request;
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

  throw new Error("Authentication required");
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
