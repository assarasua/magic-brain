import { NextRequest, NextResponse } from "next/server";
import { isUuid } from "@/lib/portfolio-list-model";
import {
  createPortfolioShare,
  listPortfolioShares,
} from "@/lib/portfolio-share";
import { attachSessionCookie, getOrCreateUser } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: RouteContext<"/api/portfolio/lists/[id]/shares">,
) {
  const session = await getOrCreateUser(request).catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const { id } = await context.params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "Invalid list ID" }, { status: 400 });
  }
  const shares = await listPortfolioShares(session.user.id, id);
  if (!shares) {
    return NextResponse.json({ error: "Portfolio list not found" }, { status: 404 });
  }
  return attachSessionCookie(
    NextResponse.json({ shares }),
    session.newToken,
  );
}

export async function POST(
  request: NextRequest,
  context: RouteContext<"/api/portfolio/lists/[id]/shares">,
) {
  const session = await getOrCreateUser(request).catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const { id } = await context.params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "Invalid list ID" }, { status: 400 });
  }
  const result = await createPortfolioShare(session.user.id, id);
  if (result.status === "missing") {
    return NextResponse.json({ error: "Portfolio list not found" }, { status: 404 });
  }
  if (result.status === "rate_limited") {
    return NextResponse.json(
      { error: "Share creation limit reached. Try again later." },
      { status: 429, headers: { "Retry-After": "3600" } },
    );
  }
  if (result.status === "limit") {
    return NextResponse.json(
      { error: "Active share limit reached" },
      { status: 409 },
    );
  }
  if (result.status === "conflict") {
    return NextResponse.json(
      { error: "Idempotency key conflict" },
      { status: 409 },
    );
  }
  const origin = new URL(request.url).origin;
  return attachSessionCookie(
    NextResponse.json(
      {
        share: result.share,
        url: `${origin}/shared/portfolio/${result.token}`,
        replacedPrevious: true,
      },
      {
        status: 201,
        headers: {
          "Cache-Control": "private, no-store",
          "X-Robots-Tag": "noindex, nofollow",
        },
      },
    ),
    session.newToken,
  );
}
