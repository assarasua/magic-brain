import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { attachSessionCookie, getOrCreateUser } from "@/lib/session";

export const runtime = "nodejs";

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
};

export async function POST(request: NextRequest) {
  try {
    const { user, newToken } = await getOrCreateUser(request);
    const body = (await request.json()) as { amount?: number };
    const amount = Number(body.amount);
    const amountCents = Math.round(amount * 100);

    if (
      !Number.isFinite(amount) ||
      amountCents < 200 ||
      amountCents > 50_000
    ) {
      return NextResponse.json(
        { error: "Donation must be between €2 and €500" },
        { status: 400 },
      );
    }

    const stripe = new Stripe(requiredEnv("STRIPE_RESTRICTED_KEY"), {
      apiVersion: "2026-08-26.dahlia",
    });
    const origin = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
    const suffix = Array.from(randomBytes(8), (byte) =>
      String.fromCharCode(97 + (byte % 26)),
    ).join("");

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      submit_type: "donate",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "eur",
            unit_amount: amountCents,
            product_data: {
              name: "Support Magic Brain",
              description: "One-time contribution to support product development.",
            },
          },
        },
      ],
      customer: user.stripeCustomerId ?? undefined,
      customer_email: user.stripeCustomerId ? undefined : user.email ?? undefined,
      client_reference_id: user.id,
      metadata: {
        kind: "donation",
        userId: user.id,
        amountCents: String(amountCents),
      },
      success_url: `${origin}/donate?donation=success`,
      cancel_url: `${origin}/donate?donation=cancelled`,
      integration_identifier: `magic_brain_donation_${suffix}`,
    });

    if (!session.url) {
      throw new Error("Stripe did not return a Checkout URL");
    }

    return attachSessionCookie(
      NextResponse.json({ url: session.url }),
      newToken,
    );
  } catch (error) {
    const message =
      error instanceof Error && error.message.includes("is not configured")
        ? error.message
        : "Unable to start donation checkout";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
