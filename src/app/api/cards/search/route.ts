import { NextRequest, NextResponse } from "next/server";
import { searchCatalog } from "@/lib/catalog";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams.get("q")?.slice(0, 100) ?? "";

  try {
    const cards = await searchCatalog(search);
    return NextResponse.json({ cards });
  } catch {
    return NextResponse.json(
      { error: "Unable to search the card catalogue" },
      { status: 500 },
    );
  }
}
