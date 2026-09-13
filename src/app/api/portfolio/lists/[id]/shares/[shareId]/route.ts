import { NextRequest, NextResponse } from "next/server";
import { isUuid } from "@/lib/portfolio-list-model";
import { revokePortfolioShare } from "@/lib/portfolio-share";
import { attachSessionCookie, getOrCreateUser } from "@/lib/session";

export const runtime = "nodejs";

export async function DELETE(
  request: NextRequest,
  context: RouteContext<"/api/portfolio/lists/[id]/shares/[shareId]">,
) {
  const session = await getOrCreateUser(request).catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const { id, shareId } = await context.params;
  if (!isUuid(id) || !isUuid(shareId)) {
    return NextResponse.json({ error: "Invalid share ID" }, { status: 400 });
  }
  if (!await revokePortfolioShare(session.user.id, id, shareId)) {
    return NextResponse.json({ error: "Share not found" }, { status: 404 });
  }
  return attachSessionCookie(
    NextResponse.json({ revoked: true }),
    session.newToken,
  );
}
