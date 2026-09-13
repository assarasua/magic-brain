import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { listMarketBriefs } from "@/lib/market-news";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  const requestedLimit = Number(request.nextUrl.searchParams.get("limit") ?? 30);
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1) {
    return NextResponse.json(
      { error: "limit must be a positive integer" },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(await listMarketBriefs(requestedLimit), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("Unable to load market briefs", error);
    return NextResponse.json(
      { error: "Unable to load market briefs" },
      { status: 500 },
    );
  }
}
