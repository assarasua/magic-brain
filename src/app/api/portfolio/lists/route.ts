import { NextRequest, NextResponse } from "next/server";
import {
  isUuid,
  MAX_PORTFOLIO_LISTS,
  parseListName,
} from "@/lib/portfolio-list-model";
import {
  createPortfolioList,
  getPortfolioLists,
  reorderPortfolioLists,
} from "@/lib/portfolio";
import { attachSessionCookie, getOrCreateUser } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = await getOrCreateUser(request).catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  return attachSessionCookie(
    NextResponse.json({ lists: await getPortfolioLists(session.user.id) }),
    session.newToken,
  );
}

export async function POST(request: NextRequest) {
  const session = await getOrCreateUser(request).catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid list" }, { status: 400 });
  }
  const record = body as Record<string, unknown>;
  if (Object.keys(record).some((key) => key !== "name")) {
    return NextResponse.json({ error: "Invalid list" }, { status: 400 });
  }
  const name = parseListName(record.name);
  if (!name) {
    return NextResponse.json({ error: "Invalid list name" }, { status: 400 });
  }
  const result = await createPortfolioList(session.user.id, name);
  if (result.status === "duplicate") {
    return NextResponse.json({ error: "List name already exists" }, { status: 409 });
  }
  if (result.status === "limit") {
    return NextResponse.json(
      { error: `Lists are limited to ${MAX_PORTFOLIO_LISTS}` },
      { status: 409 },
    );
  }
  return attachSessionCookie(
    NextResponse.json({ list: result.list }, { status: 201 }),
    session.newToken,
  );
}

export async function PATCH(request: NextRequest) {
  const session = await getOrCreateUser(request).catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid list order" }, { status: 400 });
  }
  const record = body as Record<string, unknown>;
  if (
    Object.keys(record).some((key) => key !== "orderedIds") ||
    !Array.isArray(record.orderedIds) ||
    record.orderedIds.length < 1 ||
    record.orderedIds.length > MAX_PORTFOLIO_LISTS ||
    record.orderedIds.some((id) => !isUuid(id)) ||
    new Set(record.orderedIds).size !== record.orderedIds.length
  ) {
    return NextResponse.json({ error: "Invalid list order" }, { status: 400 });
  }
  const updated = await reorderPortfolioLists(
    session.user.id,
    record.orderedIds as string[],
  );
  if (!updated) {
    return NextResponse.json({ error: "List order does not match" }, { status: 409 });
  }
  return attachSessionCookie(
    NextResponse.json({ lists: await getPortfolioLists(session.user.id) }),
    session.newToken,
  );
}
