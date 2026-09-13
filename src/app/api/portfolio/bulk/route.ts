import { NextRequest, NextResponse } from "next/server";
import { parsePortfolioBulkRequest } from "@/lib/portfolio-list-model";
import { bulkManagePortfolio } from "@/lib/portfolio";
import { attachSessionCookie, getOrCreateUser } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await getOrCreateUser(request).catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > 20_000) {
      return NextResponse.json({ error: "Bulk request is too large" }, { status: 413 });
    }
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = parsePortfolioBulkRequest(body);
  if (!parsed) {
    return NextResponse.json({ error: "Invalid bulk request" }, { status: 400 });
  }
  const outcome = await bulkManagePortfolio(session.user.id, parsed);
  if (outcome.status === "missing") {
    return NextResponse.json(
      { error: "A holding or destination list was not found" },
      { status: 404 },
    );
  }
  if (outcome.status === "conflict") {
    return NextResponse.json(
      { error: "Idempotency key was already used for another action" },
      { status: 409 },
    );
  }
  return attachSessionCookie(
    NextResponse.json(outcome.result),
    session.newToken,
  );
}
