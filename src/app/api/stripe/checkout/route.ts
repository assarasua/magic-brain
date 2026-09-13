import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { attachSessionCookie, getOrCreateUser } from "@/lib/session";

export const runtime = "nodejs";

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
};

export async function POST(request: NextRequest) {
  try {
    const { user, newToken } = await getOrCreateUser(request);
    const stripe = new Stripe(requiredEnv("STRIPE_RESTRICTED_KEY"), {
      apiVersion: "2026-08-26.dahlia",
      httpClient: Stripe.createFetchHttpClient(),
    });
    const price = requiredEnv("STRIPE_PRO_PRICE_ID");
    const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
    const suffix = Array.from(randomBytes(8), (byte) =>
      String.fromCharCode(97 + (byte % 26)),
    ).join("");

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price, quantity: 1 }],
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      customer: user.stripeCustomerId ?? undefined,
      client_reference_id: user.id,
      metadata: { userId: user.id },
      subscription_data: {
        trial_period_days: 14,
        metadata: { userId: user.id },
      },
      success_url: `${origin}/?checkout=success`,
      cancel_url: `${origin}/pro`,
      integration_identifier: `magic_brain_${suffix}`,
    });

    if (!session.url) {
      throw new Error("Stripe did not return a Checkout URL");
    }

    return attachSessionCookie(
      NextResponse.json({ url: session.url }),
      newToken,
    );
  } catch (error) {
    console.error("[stripe-checkout] Unable to create subscription session", {
      name: error instanceof Error ? error.name : typeof error,
      message: error instanceof Error ? error.message : "Unknown error",
      code:
        typeof error === "object" && error !== null && "code" in error
          ? String(error.code)
          : undefined,
      type:
        typeof error === "object" && error !== null && "type" in error
          ? String(error.type)
          : undefined,
    });
    const message =
      error instanceof Error && error.message.includes("is not configured")
        ? error.message
        : "Unable to start checkout";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
