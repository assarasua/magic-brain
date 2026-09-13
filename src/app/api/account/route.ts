import { NextRequest, NextResponse } from "next/server";
import { googleAuthConfigured } from "@/auth";
import { query } from "@/lib/db";
import { attachSessionCookie, getOrCreateUser, isPro } from "@/lib/session";
import { normalizeUserPreferences } from "@/lib/user-preferences";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { user, newToken } = await getOrCreateUser(request);
  return attachSessionCookie(
    NextResponse.json({
      id: user.id,
      locale: user.locale,
      subscriptionStatus: user.subscriptionStatus,
      isPro: isPro(user),
      authenticated: user.authenticated,
      email: user.email,
      name: user.displayName,
      avatarUrl: user.avatarUrl,
      googleAuthConfigured,
      plan: isPro(user) ? "pro" : "basic",
      hasBillingAccount: Boolean(user.stripeCustomerId),
      productTourCompleted: user.productTourCompleted,
      preferences: user.preferences,
    }),
    newToken,
  );
}

export async function PATCH(request: NextRequest) {
  const { user, newToken } = await getOrCreateUser(request);
  const body = (await request.json()) as {
    locale?: string;
    preferences?: unknown;
    productTourCompleted?: boolean;
  };

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
    : normalizeUserPreferences(body.preferences);
  await query(
    `update app_users
     set locale = coalesce($1, locale),
         preferences = $2::jsonb,
         product_tour_completed = coalesce($3, product_tour_completed),
         updated_at = now()
     where id = $4`,
    [
      body.locale ?? null,
      JSON.stringify(preferences),
      body.productTourCompleted ?? null,
      user.id,
    ],
  );

  return attachSessionCookie(
    NextResponse.json({
      locale: body.locale ?? user.locale,
      productTourCompleted:
        body.productTourCompleted ?? user.productTourCompleted,
      preferences,
    }),
    newToken,
  );
}
