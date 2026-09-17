import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { materializeLatestMarketBrief, materializeMissingMarketBriefs } from "@/lib/market-news";
import { newsletterDeliveryConfigured, sendDailyBriefNewsletter } from "@/lib/resend";

export const runtime = "nodejs";

function isAuthorized(request: NextRequest) {
  const expected = process.env.NEWS_CRON_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || !supplied) return false;
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const briefs = await materializeMissingMarketBriefs(366);
    const latest = briefs.at(-1) ?? await materializeLatestMarketBrief();
    const newsletter = latest && newsletterDeliveryConfigured()
      ? { status: "sent", broadcastId: await sendDailyBriefNewsletter(latest), marketDataDate: latest.marketDataDate }
      : { status: "not_configured" };
    return NextResponse.json({
      published: briefs.length,
      dates: briefs.map((brief) => brief.marketDataDate),
      newsletter,
    });
  } catch (error) {
    console.error("Unable to publish scheduled market briefs", error);
    return NextResponse.json({ error: "Unable to publish market briefs" }, { status: 500 });
  }
}
