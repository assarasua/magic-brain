import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getMarketBrief } from "@/lib/market-news";

export const runtime = "nodejs";

const marketDatePattern = /^\d{4}-\d{2}-\d{2}$/;

const isValidMarketDate = (value: string) => {
  if (!marketDatePattern.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) &&
    parsed.toISOString().slice(0, 10) === value;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ date: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  const { date } = await params;
  if (!isValidMarketDate(date)) {
    return NextResponse.json(
      { error: "Invalid market data date" },
      { status: 400 },
    );
  }

  try {
    const brief = await getMarketBrief(date);
    if (!brief) {
      return NextResponse.json(
        { error: "Market brief not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ brief }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("Unable to load market brief", error);
    return NextResponse.json(
      { error: "Unable to load market brief" },
      { status: 500 },
    );
  }
}
