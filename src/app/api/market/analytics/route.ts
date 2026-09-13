import { NextRequest, NextResponse } from "next/server";
import { getMarketAnalytics } from "@/lib/catalog";
import { attachSessionCookie, getOrCreateUser, isPro } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const requestedDays = Number(request.nextUrl.searchParams.get("days") ?? 30);
  const days = [1, 7, 30, 90].includes(requestedDays) ? requestedDays : 30;

  try {
    const { user, newToken } = await getOrCreateUser(request);
    if (!isPro(user)) {
      return attachSessionCookie(
        NextResponse.json(
          { error: "Advanced market analytics requires Brain Pro" },
          { status: 403 },
        ),
        newToken,
      );
    }
    return attachSessionCookie(
      NextResponse.json(
        { ...(await getMarketAnalytics(days)), days },
        {
          headers: {
            "Cache-Control": "private, max-age=60",
          },
        },
      ),
      newToken,
    );
  } catch {
    return NextResponse.json(
      { error: "Unable to load market analytics" },
      { status: 500 },
    );
  }
}
