import { NextRequest, NextResponse } from "next/server";
import {
  consolidateConfirmedImport,
  validateConfirmedImport,
  validatePreviewImport,
} from "@/lib/portfolio-import-model";
import {
  importPortfolioItems,
  resolvePortfolioImport,
} from "@/lib/portfolio-import";
import { attachSessionCookie, getOrCreateUser } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const session = await getOrCreateUser(request).catch(() => null);
    if (!session) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }
    let body: unknown;
    try {
      const rawBody = await request.text();
      if (rawBody.length > 750_000) {
        return NextResponse.json(
          { error: "Import request is too large" },
          { status: 413 },
        );
      }
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid import request" }, { status: 400 });
    }
    const record = body as Record<string, unknown>;
    const { user, newToken } = session;

    if (record.action === "preview") {
      if (
        Object.keys(record).some((key) => !["action", "rows"].includes(key))
      ) {
        return NextResponse.json(
          { error: "Invalid import request" },
          { status: 400 },
        );
      }
      const rows = validatePreviewImport(record.rows);
      if (!rows) {
        return NextResponse.json(
          { error: "Invalid import rows" },
          { status: 400 },
        );
      }
      return attachSessionCookie(
        NextResponse.json({ rows: await resolvePortfolioImport(user.id, rows) }),
        newToken,
      );
    }

    if (record.action === "confirm") {
      if (
        Object.keys(record).some(
          (key) => !["action", "rows", "existingStrategy"].includes(key),
        ) ||
        (record.existingStrategy !== "add" && record.existingStrategy !== "skip")
      ) {
        return NextResponse.json(
          { error: "Invalid import request" },
          { status: 400 },
        );
      }
      const validated = validateConfirmedImport(record.rows);
      const rows = validated ? consolidateConfirmedImport(validated) : null;
      if (!rows) {
        return NextResponse.json(
          { error: "Invalid import rows" },
          { status: 400 },
        );
      }
      const result = await importPortfolioItems(
        user.id,
        rows,
        record.existingStrategy,
      );
      return attachSessionCookie(
        NextResponse.json(result, { status: 201 }),
        newToken,
      );
    }

    return NextResponse.json({ error: "Invalid import action" }, { status: 400 });
  } catch {
    return NextResponse.json(
      { error: "Unable to import portfolio" },
      { status: 500 },
    );
  }
}
