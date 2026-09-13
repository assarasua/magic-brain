import { NextResponse } from "next/server";
import { getSetOptions } from "@/lib/sets";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(
      { sets: await getSetOptions() },
      {
        headers: {
          "Cache-Control":
            "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      },
    );
  } catch {
    return NextResponse.json(
      { error: "Unable to load set options" },
      { status: 500 },
    );
  }
}
