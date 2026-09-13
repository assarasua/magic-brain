import { NextRequest, NextResponse } from "next/server";
import { googleAuthConfigured } from "@/auth";
import { query } from "@/lib/db";
import { attachSessionCookie, getOrCreateUser } from "@/lib/session";
import { parseUserPreferences } from "@/lib/user-preferences";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { user, newToken } = await getOrCreateUser(request);
  return attachSessionCookie(
    NextResponse.json({
      id: user.id,
      locale: user.locale,
      authenticated: user.authenticated,
      email: user.email,
      name: user.displayName,
      avatarUrl: user.avatarUrl,
      googleAuthConfigured,
      productTourCompleted: user.productTourCompleted,
      preferencesOnboardingCompleted: user.preferencesOnboardingCompleted,
      preferences: user.preferences,
    }),
    newToken,
  );
}

export async function PATCH(request: NextRequest) {
  const { user, newToken } = await getOrCreateUser(request);
  const body = (await request.json().catch(() => null)) as {
    locale?: string;
    preferences?: unknown;
    productTourCompleted?: boolean;
  } | null;

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (
    Object.keys(body).some(
      (key) =>
        key !== "locale" &&
        key !== "preferences" &&
        key !== "productTourCompleted",
    )
  ) {
    return NextResponse.json({ error: "Unknown account field" }, { status: 400 });
  }

  if (
    body.locale !== undefined &&
    body.locale !== "en" &&
    body.locale !== "es"
  ) {
    return NextResponse.json({ error: "Unsupported locale" }, { status: 400 });
  }

  if (
    body.locale === undefined &&
    body.preferences === undefined &&
    body.productTourCompleted === undefined
  ) {
    return NextResponse.json({ error: "No account changes supplied" }, { status: 400 });
  }

  if (
    body.productTourCompleted !== undefined &&
    typeof body.productTourCompleted !== "boolean"
  ) {
    return NextResponse.json({ error: "Invalid tour status" }, { status: 400 });
  }

  const preferences = body.preferences === undefined
    ? user.preferences
    : parseUserPreferences(body.preferences);
  if (!preferences) {
    return NextResponse.json(
      { error: "Invalid investment preferences" },
      { status: 400 },
    );
  }
  const preferencesOnboardingCompleted =
    body.preferences === undefined
      ? user.preferencesOnboardingCompleted
      : true;

  await query(
    `update app_users
     set locale = coalesce($1, locale),
         preferences = $2::jsonb,
         product_tour_completed = coalesce($3, product_tour_completed),
         preferences_onboarding_completed = $4,
         updated_at = now()
     where id = $5`,
    [
      body.locale ?? null,
      JSON.stringify(preferences),
      body.productTourCompleted ?? null,
      preferencesOnboardingCompleted,
      user.id,
    ],
  );

  return attachSessionCookie(
    NextResponse.json({
      locale: body.locale ?? user.locale,
      productTourCompleted:
        body.productTourCompleted ?? user.productTourCompleted,
      preferencesOnboardingCompleted,
      preferences,
    }),
    newToken,
  );
}
