import { NextRequest, NextResponse } from "next/server";
import { recordMcpCall } from "@/lib/mcp-audit";
import { getWebMcpDestination } from "@/lib/web-mcp";

const maxDurationMs = 300_000;

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Origin is not allowed" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid event" }, { status: 400 });
  }

  const event = body as Record<string, unknown>;
  const destination = typeof event.destination === "string" ? event.destination : "";
  const durationMs = typeof event.durationMs === "number" ? event.durationMs : NaN;
  if (
    event.source !== "webmcp" ||
    event.toolName !== "navigate_magic_brain" ||
    !getWebMcpDestination(destination) ||
    !Number.isFinite(durationMs) ||
    durationMs < 0 ||
    durationMs > maxDurationMs
  ) {
    return NextResponse.json({ error: "Invalid event" }, { status: 400 });
  }

  await recordMcpCall({
    source: "webmcp",
    toolName: "navigate_magic_brain",
    success: event.success === true,
    durationMs,
    metadata: { destination },
  });

  return new NextResponse(null, { status: 204 });
}
