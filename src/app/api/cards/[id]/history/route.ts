import { NextRequest, NextResponse } from "next/server";
import { getPriceHistory } from "@/lib/price-history";
import { calculateSeriesMetrics } from "@/lib/financial-analytics";

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

  const interval = request.nextUrl.searchParams.get("interval") ?? "daily";
  if (interval !== "daily" && interval !== "monthly") {
    return NextResponse.json(
      { error: "Interval must be daily or monthly" },
      { status: 400 },
    );
  }

  try {
    const history = await getPriceHistory(id, interval);
    const metrics = interval === "daily" ? calculateSeriesMetrics(
      history.flatMap((point) =>
        point.eur === null ? [] : [{ date: point.date, value: point.eur }],
      ),
    ) : null;
    return NextResponse.json({ history, metrics, interval, source: "mtgjson" });
  } catch {
    return NextResponse.json(
      { error: "Unable to load price history" },
      { status: 500 },
    );
  }
}
