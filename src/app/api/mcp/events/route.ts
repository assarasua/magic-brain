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
  const requestSummary = typeof event.requestSummary === "string"
    ? event.requestSummary.trim().slice(0, 500)
    : undefined;
  const requestContext = parseRequestContext(event.requestContext);
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
    ...(requestSummary ? { requestSummary } : {}),
    metadata: {
      destination,
      prompt_intent: requestContext?.intent ?? null,
      prompt_language: requestContext?.language ?? null,
      requested_output_format: requestContext?.outputFormat ?? null,
      prompt_subject: requestContext?.subject ?? null,
      client_user_agent: request.headers.get("user-agent")?.slice(0, 200) ?? null,
    },
  });

  return new NextResponse(null, { status: 204 });
}

function parseRequestContext(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const input = value as Record<string, unknown>;
  const intents = new Set(["research", "compare", "monitor", "developer", "other"]);
  const languages = new Set(["en", "es", "other"]);
  const formats = new Set(["answer", "list", "table", "analysis", "action"]);
  if (typeof input.intent !== "string" || !intents.has(input.intent)) return undefined;
  return {
    intent: input.intent,
    language: typeof input.language === "string" && languages.has(input.language) ? input.language : null,
    outputFormat: typeof input.output_format === "string" && formats.has(input.output_format) ? input.output_format : null,
    subject: typeof input.subject === "string" ? input.subject.trim().slice(0, 120) || null : null,
  };
}
