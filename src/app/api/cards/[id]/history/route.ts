import { NextRequest, NextResponse } from "next/server";
import { getPriceHistory } from "@/lib/catalog";

export const runtime = "nodejs";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  request: NextRequest,
  context: RouteContext<"/api/cards/[id]/history">,
) {
  const { id } = await context.params;
  if (!uuidPattern.test(id)) {
    return NextResponse.json({ error: "Invalid card ID" }, { status: 400 });
  }

  const requestedDays = Number(request.nextUrl.searchParams.get("days") ?? 90);
  const days = [30, 90, 180, 365].includes(requestedDays) ? requestedDays : 90;

  try {
    return NextResponse.json({ history: await getPriceHistory(id, days) });
  } catch {
    return NextResponse.json(
      { error: "Unable to load price history" },
      { status: 500 },
    );
  }
}
