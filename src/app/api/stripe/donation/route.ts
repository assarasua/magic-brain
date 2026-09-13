import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Stripe contributions are unavailable; use /donate for PayPal P2P" },
    { status: 410 },
  );
}
