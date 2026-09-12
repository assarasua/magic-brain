import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { attachSessionCookie, getOrCreateUser } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const { user, newToken } = await getOrCreateUser(request);
  if (!user.stripeCustomerId || !process.env.STRIPE_RESTRICTED_KEY) {
    return NextResponse.json(
      { error: "No active billing account" },
      { status: 400 },
    );
  }

  const stripe = new Stripe(process.env.STRIPE_RESTRICTED_KEY, {
    apiVersion: "2026-08-26.dahlia",
  });
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${origin}/`,
  });

  return attachSessionCookie(
    NextResponse.json({ url: session.url }),
    newToken,
  );
}
