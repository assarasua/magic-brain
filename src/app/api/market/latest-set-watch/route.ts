import { NextRequest, NextResponse } from "next/server";
import { getLatestSetWatch } from "@/lib/latest-set-watch";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const setCode = request.nextUrl.searchParams.get("set")?.slice(0, 20);
    const result = await getLatestSetWatch(setCode);
    if (setCode && !result.set) {
      return NextResponse.json(
        { error: "Unknown set code" },
        { status: 404 },
      );
    }
    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to load latest set analysis" },
      { status: 500 },
    );
  }
}
