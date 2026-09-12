import { NextResponse } from "next/server";
import Stripe from "stripe";
import { query } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const key = process.env.STRIPE_RESTRICTED_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");

  if (!key || !webhookSecret || !signature) {
    return NextResponse.json(
      { error: "Stripe webhook is not configured" },
      { status: 400 },
    );
  }

  const stripe = new Stripe(key, { apiVersion: "2026-08-26.dahlia" });
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      await request.text(),
      signature,
      webhookSecret,
    );
  } catch {
    return NextResponse.json(
      { error: "Invalid webhook signature" },
      { status: 400 },
    );
  }

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object;
      const userId = session.metadata?.userId ?? session.client_reference_id;
      const customerId =
        typeof session.customer === "string" ? session.customer : null;
      const subscriptionId =
        typeof session.subscription === "string" ? session.subscription : null;
      if (userId) {
        await query(
          `
            update app_users
            set stripe_customer_id = coalesce($1, stripe_customer_id),
                stripe_subscription_id = coalesce($2, stripe_subscription_id),
                subscription_status = 'trialing',
                updated_at = now()
            where id = $3
          `,
          [customerId, subscriptionId, userId],
        );
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object;
      const customerId =
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer.id;
      await query(
        `
          update app_users
          set stripe_subscription_id = $1,
              subscription_status = $2,
              subscription_current_period_end = to_timestamp($3),
              updated_at = now()
          where stripe_customer_id = $4 or id::text = $5
        `,
        [
          subscription.id,
          subscription.status,
          subscription.items.data[0]?.current_period_end ?? 0,
          customerId,
          subscription.metadata.userId ?? "",
        ],
      );
      break;
    }
    case "invoice.paid":
    case "invoice.payment_failed": {
      const invoice = event.data.object;
      const customerId =
        typeof invoice.customer === "string" ? invoice.customer : null;
      if (customerId) {
        await query(
          `
            update app_users
            set subscription_status = $1, updated_at = now()
            where stripe_customer_id = $2
          `,
          [event.type === "invoice.paid" ? "active" : "past_due", customerId],
        );
      }
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
