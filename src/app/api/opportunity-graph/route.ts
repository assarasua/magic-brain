import { NextRequest, NextResponse } from "next/server";
import { getOpportunityGraph } from "@/lib/opportunity-graph";

export const runtime = "nodejs";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const requestedLimit = Number(request.nextUrl.searchParams.get("limit") ?? 48);
  const limit = Number.isInteger(requestedLimit)
    ? Math.max(12, Math.min(80, requestedLimit))
    : 48;
  const search =
    request.nextUrl.searchParams.get("q")?.trim().slice(0, 100) || undefined;
  const requestedFocus = request.nextUrl.searchParams.get("focus") || undefined;

  if (requestedFocus && !uuidPattern.test(requestedFocus)) {
    return NextResponse.json({ error: "Invalid focus card ID" }, { status: 400 });
  }

  try {
    return NextResponse.json(
      await getOpportunityGraph({
        limit,
        search,
        focusId: requestedFocus,
      }),
      {
        headers: {
          "Cache-Control": "private, max-age=60, stale-while-revalidate=240",
        },
      },
    );
  } catch {
    return NextResponse.json(
      { error: "Unable to build the opportunity graph" },
      { status: 500 },
    );
  }
}
