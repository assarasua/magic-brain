import { NextRequest, NextResponse } from "next/server";
import { addPortfolioItem, getPortfolio } from "@/lib/portfolio";
import { isCardLanguage } from "@/lib/card-languages";
import { attachSessionCookie, getOrCreateUser } from "@/lib/session";

export const runtime = "nodejs";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  try {
    const { user, newToken } = await getOrCreateUser(request);
    return attachSessionCookie(
      NextResponse.json(await getPortfolio(user.id)),
      newToken,
    );
  } catch {
    return NextResponse.json(
      { error: "Unable to load portfolio" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, newToken } = await getOrCreateUser(request);
    const body = (await request.json()) as {
      cardId?: string;
      quantity?: number;
      purchasePrice?: number;
      condition?: string;
      language?: string;
      acquiredAt?: string;
    };

    if (
      !body.cardId ||
      !uuidPattern.test(body.cardId) ||
      !Number.isInteger(body.quantity) ||
      Number(body.quantity) < 1 ||
      !Number.isFinite(body.purchasePrice) ||
      Number(body.purchasePrice) < 0 ||
      (body.language !== undefined && !isCardLanguage(body.language))
    ) {
      return NextResponse.json(
        { error: "Invalid portfolio item" },
        { status: 400 },
      );
    }

    await addPortfolioItem(user.id, {
      cardId: body.cardId,
      quantity: Number(body.quantity),
      purchasePrice: Number(body.purchasePrice),
      condition: body.condition?.slice(0, 30) || "near_mint",
      language: isCardLanguage(body.language) ? body.language : "en",
      acquiredAt: body.acquiredAt,
    });

    return attachSessionCookie(
      NextResponse.json(await getPortfolio(user.id), { status: 201 }),
      newToken,
    );
  } catch {
    return NextResponse.json(
      { error: "Unable to add portfolio item" },
      { status: 500 },
    );
  }
}
