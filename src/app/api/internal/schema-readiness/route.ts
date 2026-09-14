import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import {
  type SchemaReadinessClaim,
  verifySchemaReadinessSignature,
} from "@/lib/schema-readiness";

export const dynamic = "force-dynamic";

type MigrationRow = {
  checksum: string;
};

function parseClaim(request: NextRequest): SchemaReadinessClaim | null {
  const commit = request.nextUrl.searchParams.get("commit") ?? "";
  const filename = request.nextUrl.searchParams.get("filename") ?? "";
  const checksum = request.nextUrl.searchParams.get("checksum") ?? "";
  const expires = Number(request.nextUrl.searchParams.get("expires"));
  const now = Math.floor(Date.now() / 1000);
  if (
    !/^[0-9a-f]{40}$/i.test(commit) ||
    !/^\d{3}_[a-z0-9_]+\.sql$/.test(filename) ||
    !/^[0-9a-f]{64}$/i.test(checksum) ||
    !Number.isInteger(expires) ||
    expires < now ||
    expires > now + 180
  ) {
    return null;
  }
  return { commit, filename, checksum, expires };
}

export async function GET(request: NextRequest) {
  const claim = parseClaim(request);
  const signature = request.headers.get("x-release-signature") ?? "";
  const secret = process.env.AUTH_SECRET;
  if (
    !claim ||
    !secret ||
    !verifySchemaReadinessSignature(secret, claim, signature)
  ) {
    return NextResponse.json(
      { ready: false },
      {
        status: 401,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  try {
    const result = await query<MigrationRow>(
      "select checksum from app_schema_migrations where filename = $1",
      [claim.filename],
    );
    const ready = result.rows[0]?.checksum === claim.checksum;
    return NextResponse.json(
      { ready },
      {
        status: ready ? 200 : 409,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch {
    return NextResponse.json(
      { ready: false },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
