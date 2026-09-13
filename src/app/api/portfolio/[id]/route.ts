import { NextRequest, NextResponse } from "next/server";
import { isCardLanguage } from "@/lib/card-languages";
import {
  deletePortfolioItem,
  getPortfolio,
  updatePortfolioItem,
} from "@/lib/portfolio";
import { parsePortfolioUpdate } from "@/lib/portfolio-model";
import { attachSessionCookie, getOrCreateUser } from "@/lib/session";

export const runtime = "nodejs";

export async function DELETE(
  request: NextRequest,
  context: RouteContext<"/api/portfolio/[id]">,
) {
  const session = await getOrCreateUser(request).catch(() => null);
  if (!session) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }
  const { user, newToken } = session;
  const { id } = await context.params;
  const itemId = Number(id);

  if (!Number.isInteger(itemId) || itemId < 1) {
    return NextResponse.json({ error: "Invalid holding ID" }, { status: 400 });
  }

  const deleted = await deletePortfolioItem(user.id, itemId);
  if (!deleted) {
    return NextResponse.json({ error: "Holding not found" }, { status: 404 });
  }
  return attachSessionCookie(
    NextResponse.json(await getPortfolio(user.id)),
    newToken,
  );
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext<"/api/portfolio/[id]">,
) {
  const session = await getOrCreateUser(request).catch(() => null);
  if (!session) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }
  const { user, newToken } = session;
  const { id } = await context.params;
  const itemId = Number(id);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    !Number.isInteger(itemId) ||
    itemId < 1 ||
    body === null ||
    typeof body !== "object" ||
    Array.isArray(body)
  ) {
    return NextResponse.json(
      { error: "Invalid portfolio update" },
      { status: 400 },
    );
  }

  const update = parsePortfolioUpdate(body, isCardLanguage);
  if (!update) {
    return NextResponse.json(
      { error: "Invalid portfolio update" },
      { status: 400 },
    );
  }

  const updated = await updatePortfolioItem(user.id, itemId, update);
  if (!updated) {
    return NextResponse.json({ error: "Holding not found" }, { status: 404 });
  }
  return attachSessionCookie(
    NextResponse.json(await getPortfolio(user.id)),
    newToken,
  );
}
