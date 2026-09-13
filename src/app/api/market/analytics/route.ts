import { NextRequest, NextResponse } from "next/server";
import { getMarketAnalytics } from "@/lib/catalog";
import { attachSessionCookie, getOrCreateUser } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const requestedDays = Number(request.nextUrl.searchParams.get("days") ?? 30);
  const days = [1, 7, 30, 90].includes(requestedDays) ? requestedDays : 30;

  try {
    const { newToken } = await getOrCreateUser(request);
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
