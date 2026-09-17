import { NextRequest, NextResponse } from "next/server";
import { getReferralDashboard } from "@/lib/referrals";
import { getOrCreateUser } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = await getOrCreateUser(request).catch(() => null);
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  return NextResponse.json(await getReferralDashboard(session.user.id), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
