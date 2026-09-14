import { NextRequest, NextResponse } from "next/server";
import { recordPortfolioSale } from "@/lib/portfolio";
import { parsePortfolioSale } from "@/lib/portfolio-model";
import { attachSessionCookie, getOrCreateUser } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: RouteContext<"/api/portfolio/[id]/sales">,
) {
  const session = await getOrCreateUser(request).catch(() => null);
  if (!session) {
    return NextResponse.json(
      { code: "authentication_required", error: "Authentication required" },
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
    return NextResponse.json(
      { code: "invalid_sale", error: "Invalid JSON body" },
      { status: 400 },
    );
  }
  const input = parsePortfolioSale(body);
  if (!Number.isInteger(itemId) || itemId < 1 || !input) {
    return NextResponse.json(
      { code: "invalid_sale", error: "Invalid portfolio sale" },
      { status: 400 },
    );
  }

  try {
    const result = await recordPortfolioSale(user.id, itemId, input);
    if (result.status === "missing") {
      return NextResponse.json(
        { code: "holding_missing", error: "Holding not found in this list" },
        { status: 404 },
      );
    }
    if (result.status === "invalid_date") {
      return NextResponse.json(
        {
          code: "sale_before_purchase",
          error: "Sale date cannot be before the purchase date",
        },
        { status: 409 },
      );
    }
    if (result.status === "insufficient_quantity") {
      return NextResponse.json(
        {
          code: "insufficient_quantity",
          error: "The holding no longer has enough quantity",
          availableQuantity: result.availableQuantity,
        },
        { status: 409 },
      );
    }
    if (result.status === "conflict") {
      return NextResponse.json(
        {
          code: "idempotency_conflict",
          error: "This request ID was already used for another sale",
        },
        { status: 409 },
      );
    }
    return attachSessionCookie(
      NextResponse.json(
        { sale: result.sale, replayed: result.replayed },
        { status: result.replayed ? 200 : 201 },
      ),
      newToken,
    );
  } catch {
    return NextResponse.json(
      { code: "sale_failed", error: "Unable to record portfolio sale" },
      { status: 500 },
    );
  }
}
