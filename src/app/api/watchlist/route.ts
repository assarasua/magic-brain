import { NextRequest, NextResponse } from "next/server";
import {
  addWatchlistItem,
  deleteWatchlistItem,
  getWatchlist,
  updateAlertState,
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
    alertBelowEnabled?: boolean;
    alertAbovePrice?: number | null;
    alertAboveEnabled?: boolean;
  };

  if (!body.cardId || !uuidPattern.test(body.cardId)) {
    return NextResponse.json({ error: "Invalid card ID" }, { status: 400 });
  }

  for (const value of [body.targetPrice, body.alertAbovePrice]) {
    if (
      value !== null &&
      value !== undefined &&
      (!Number.isFinite(Number(value)) || Number(value) < 0)
    ) {
      return NextResponse.json({ error: "Invalid alert price" }, { status: 400 });
    }
  }

  await addWatchlistItem(user.id, body.cardId, {
    ...("targetPrice" in body && {
      targetPrice: body.targetPrice === null ? null : Number(body.targetPrice),
    }),
    ...("alertBelowEnabled" in body && {
      alertBelowEnabled: body.alertBelowEnabled === true,
    }),
    ...("alertAbovePrice" in body && {
      alertAbovePrice:
        body.alertAbovePrice === null ? null : Number(body.alertAbovePrice),
    }),
    ...("alertAboveEnabled" in body && {
      alertAboveEnabled: body.alertAboveEnabled === true,
    }),
  });
  return attachSessionCookie(
    NextResponse.json({ cards: await getWatchlist(user.id) }, { status: 201 }),
    newToken,
  );
}

export async function PATCH(request: NextRequest) {
  const { user, newToken } = await getOrCreateUser(request);
  const body = (await request.json()) as {
    cardId?: string;
    direction?: "below" | "above";
    action?: "dismiss" | "reset";
  };

  if (!body.cardId || !uuidPattern.test(body.cardId)) {
    return NextResponse.json({ error: "Invalid card ID" }, { status: 400 });
  }
  if (!["below", "above"].includes(body.direction ?? "")) {
    return NextResponse.json({ error: "Invalid alert direction" }, { status: 400 });
  }
  if (!["dismiss", "reset"].includes(body.action ?? "")) {
    return NextResponse.json({ error: "Invalid alert action" }, { status: 400 });
  }

  await updateAlertState(user.id, body.cardId, body.direction!, body.action!);
  return attachSessionCookie(
    NextResponse.json({ cards: await getWatchlist(user.id, false) }),
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
