import { NextRequest, NextResponse } from "next/server";
import { isUuid, parseListName } from "@/lib/portfolio-list-model";
import {
  deletePortfolioList,
  getPortfolioLists,
  renamePortfolioList,
} from "@/lib/portfolio";
import { attachSessionCookie, getOrCreateUser } from "@/lib/session";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  context: RouteContext<"/api/portfolio/lists/[id]">,
) {
  const session = await getOrCreateUser(request).catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const { id } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (
    !isUuid(id) ||
    body === null ||
    typeof body !== "object" ||
    Array.isArray(body)
  ) {
    return NextResponse.json({ error: "Invalid list update" }, { status: 400 });
  }
  const record = body as Record<string, unknown>;
  const name = parseListName(record.name);
  if (
    !name ||
    Object.keys(record).some((key) => key !== "name")
  ) {
    return NextResponse.json({ error: "Invalid list update" }, { status: 400 });
  }
  const status = await renamePortfolioList(session.user.id, id, name);
  if (status === "missing") {
    return NextResponse.json({ error: "Portfolio list not found" }, { status: 404 });
  }
  if (status === "duplicate") {
    return NextResponse.json({ error: "List name already exists" }, { status: 409 });
  }
  return attachSessionCookie(
    NextResponse.json({ lists: await getPortfolioLists(session.user.id) }),
    session.newToken,
  );
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext<"/api/portfolio/lists/[id]">,
) {
  const session = await getOrCreateUser(request).catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const { id } = await context.params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "Invalid list ID" }, { status: 400 });
  }
  let body: unknown = {};
  const text = await request.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid deletion request" }, { status: 400 });
  }
  const record = body as Record<string, unknown>;
  if (
    Object.keys(record).some((key) => key !== "destinationListId") ||
    (record.destinationListId !== undefined &&
      !isUuid(record.destinationListId))
  ) {
    return NextResponse.json({ error: "Invalid deletion request" }, { status: 400 });
  }
  const status = await deletePortfolioList(
    session.user.id,
    id,
    typeof record.destinationListId === "string"
      ? record.destinationListId
      : undefined,
  );
  if (status === "missing") {
    return NextResponse.json({ error: "Portfolio list not found" }, { status: 404 });
  }
  if (status === "protected") {
    return NextResponse.json(
      { error: "The default or last list cannot be deleted" },
      { status: 409 },
    );
  }
  if (status === "destination_required") {
    return NextResponse.json(
      { error: "Choose another list for existing holdings" },
      { status: 409 },
    );
  }
  return attachSessionCookie(
    NextResponse.json({ lists: await getPortfolioLists(session.user.id) }),
    session.newToken,
  );
}
