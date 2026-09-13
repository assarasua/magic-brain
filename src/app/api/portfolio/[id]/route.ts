import { NextRequest, NextResponse } from "next/server";
import { isCardLanguage } from "@/lib/card-languages";
import {
  deletePortfolioItem,
  getPortfolio,
  updatePortfolioItemLanguage,
} from "@/lib/portfolio";
import { attachSessionCookie, getOrCreateUser } from "@/lib/session";

export const runtime = "nodejs";

export async function DELETE(
  request: NextRequest,
  context: RouteContext<"/api/portfolio/[id]">,
) {
  const { user, newToken } = await getOrCreateUser(request);
  const { id } = await context.params;
  const itemId = Number(id);

  if (!Number.isInteger(itemId) || itemId < 1) {
    return NextResponse.json({ error: "Invalid holding ID" }, { status: 400 });
  }

  await deletePortfolioItem(user.id, itemId);
  return attachSessionCookie(
    NextResponse.json(await getPortfolio(user.id)),
    newToken,
  );
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext<"/api/portfolio/[id]">,
) {
  const { user, newToken } = await getOrCreateUser(request);
  const { id } = await context.params;
  const itemId = Number(id);
  const body = (await request.json()) as { language?: unknown };

  if (
    !Number.isInteger(itemId) ||
    itemId < 1 ||
    !isCardLanguage(body.language)
  ) {
    return NextResponse.json(
      { error: "Invalid portfolio update" },
      { status: 400 },
    );
  }

  await updatePortfolioItemLanguage(user.id, itemId, body.language);
  return attachSessionCookie(
    NextResponse.json(await getPortfolio(user.id)),
    newToken,
  );
}
