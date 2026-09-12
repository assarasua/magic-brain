import { NextRequest, NextResponse } from "next/server";
import { getCatalogCard } from "@/lib/catalog";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  context: RouteContext<"/api/cards/[id]">,
) {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid card ID" }, { status: 400 });
  }

  const card = await getCatalogCard(id);
  if (!card) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }
  return NextResponse.json({ card });
}
