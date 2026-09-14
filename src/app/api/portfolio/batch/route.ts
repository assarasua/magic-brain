import { NextRequest, NextResponse } from "next/server";
import { addPortfolioItemsBatch } from "@/lib/portfolio";
import {
  isIdempotencyKey,
  parsePortfolioBatch,
} from "@/lib/portfolio-batch-model";
import { attachSessionCookie, getOrCreateUser } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await getOrCreateUser(request).catch(() => null);
  if (!session) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  const idempotencyKey = request.headers.get("idempotency-key");
  if (!isIdempotencyKey(idempotencyKey)) {
    return NextResponse.json(
      { error: "A valid Idempotency-Key is required" },
      { status: 400 },
    );
  }

  const body = await request.json().catch(() => null);
  const items = parsePortfolioBatch(body);
  if (!items) {
    return NextResponse.json(
      { error: "Invalid or unresolved batch items" },
      { status: 400 },
    );
  }

  try {
    const result = await addPortfolioItemsBatch(
      session.user.id,
      items,
      idempotencyKey,
    );
    return attachSessionCookie(
      NextResponse.json(result, { status: result.replayed ? 200 : 201 }),
      session.newToken,
    );
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("invalid_list:")) {
      return NextResponse.json(
        {
          error: "One or more destination lists are unavailable",
          clientId: error.message.slice("invalid_list:".length),
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "No cards were added; the atomic batch was rolled back" },
      { status: 500 },
    );
  }
}
