import { NextRequest, NextResponse } from "next/server";
import { parsePortfolioBulkRequest } from "@/lib/portfolio-list-model";
import { bulkManagePortfolio } from "@/lib/portfolio";
import { attachSessionCookie, getOrCreateUser } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const session = await getOrCreateUser(request).catch(() => null);
    if (!session) {
      return NextResponse.json(
        { code: "authentication_required", error: "Authentication required" },
        { status: 401 },
      );
    }
    let body: unknown;
    try {
      const text = await request.text();
      if (text.length > 20_000) {
        return NextResponse.json(
          { code: "request_too_large", error: "Bulk request is too large" },
          { status: 413 },
        );
      }
      body = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { code: "invalid_json", error: "Invalid JSON body" },
        { status: 400 },
      );
    }
    const parsed = parsePortfolioBulkRequest(body);
    if (!parsed) {
      return NextResponse.json(
        {
          code: "invalid_bulk_request",
          error:
            "Choose 1–200 unique holdings and a valid source and destination list",
        },
        { status: 400 },
      );
    }
    const outcome = await bulkManagePortfolio(session.user.id, parsed);
    if (outcome.status === "source_list_missing") {
      return NextResponse.json(
        { code: outcome.status, error: "The source list no longer exists" },
        { status: 404 },
      );
    }
    if (outcome.status === "destination_missing") {
      return NextResponse.json(
        { code: outcome.status, error: "The destination list no longer exists" },
        { status: 404 },
      );
    }
    if (outcome.status === "invalid_destination") {
      return NextResponse.json(
        { code: outcome.status, error: "Choose a different destination list" },
        { status: 409 },
      );
    }
    if (outcome.status === "holdings_missing") {
      return NextResponse.json(
        {
          code: outcome.status,
          error: "Some selected holdings changed or no longer exist",
          requested: outcome.requested,
          found: outcome.found,
        },
        { status: 409 },
      );
    }
    if (outcome.status === "conflict") {
      return NextResponse.json(
        {
          code: "idempotency_conflict",
          error: "This operation key was already used for another request",
        },
        { status: 409 },
      );
    }
    return attachSessionCookie(
      NextResponse.json(outcome.result),
      session.newToken,
    );
  } catch {
    return NextResponse.json(
      {
        code: "bulk_operation_failed",
        error: "The operation could not be completed. Your selection was not changed.",
      },
      { status: 500 },
    );
  }
}
