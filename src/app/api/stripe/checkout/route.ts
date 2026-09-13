import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Subscriptions are unavailable; Brain Pro is free for now" },
    { status: 410 },
  );
}
