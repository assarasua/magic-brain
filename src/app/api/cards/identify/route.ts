import { NextRequest, NextResponse } from "next/server";
import { identifyCatalogCard } from "@/lib/catalog";
import { parseIdentifyRequest } from "@/lib/card-scan-model";
import { attachSessionCookie, getOrCreateUser } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await getOrCreateUser(request).catch(() => null);
  if (!session) {
    return NextResponse.json(
      { code: "authentication_required", error: "Authentication required" },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { code: "invalid_scan", error: "Invalid JSON body" },
      { status: 400 },
    );
  }
  const scan = parseIdentifyRequest(body);
  if (!scan) {
    return NextResponse.json(
      { code: "invalid_scan", error: "Invalid or oversized OCR scan" },
      { status: 400 },
    );
  }

  try {
    const candidates = await identifyCatalogCard(scan);
    return attachSessionCookie(NextResponse.json({ candidates }), session.newToken);
  } catch {
    return NextResponse.json(
      { code: "identify_failed", error: "Unable to identify card" },
      { status: 500 },
    );
  }
}
