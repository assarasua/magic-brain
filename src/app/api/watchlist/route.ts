import { NextRequest, NextResponse } from "next/server";
import {
  addWatchlistItem,
  deleteWatchlistItem,
  getWatchlist,
} from "@/lib/watchlist";
import { attachSessionCookie, getOrCreateUser } from "@/lib/session";

export const runtime = "nodejs";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const { user, newToken } = await getOrCreateUser(request);
  return attachSessionCookie(
    NextResponse.json({ cards: await getWatchlist(user.id) }),
    newToken,
  );
}

export async function POST(request: NextRequest) {
  const { user, newToken } = await getOrCreateUser(request);
  const body = (await request.json()) as {
    cardId?: string;
    targetPrice?: number | null;
  };

  if (!body.cardId || !uuidPattern.test(body.cardId)) {
    return NextResponse.json({ error: "Invalid card ID" }, { status: 400 });
  }

  const targetPrice =
    body.targetPrice === null || body.targetPrice === undefined
      ? null
      : Number(body.targetPrice);
  if (targetPrice !== null && (!Number.isFinite(targetPrice) || targetPrice < 0)) {
    return NextResponse.json({ error: "Invalid target price" }, { status: 400 });
  }

  await addWatchlistItem(user.id, body.cardId, targetPrice);
  return attachSessionCookie(
    NextResponse.json({ cards: await getWatchlist(user.id) }, { status: 201 }),
    newToken,
  );
}

export async function DELETE(request: NextRequest) {
  const { user, newToken } = await getOrCreateUser(request);
  const cardId = request.nextUrl.searchParams.get("cardId");

  if (!cardId || !uuidPattern.test(cardId)) {
    return NextResponse.json({ error: "Invalid card ID" }, { status: 400 });
  }

  await deleteWatchlistItem(user.id, cardId);
  return attachSessionCookie(
    NextResponse.json({ cards: await getWatchlist(user.id) }),
    newToken,
  );
}
