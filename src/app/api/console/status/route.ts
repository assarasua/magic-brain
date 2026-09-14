export const runtime = "nodejs";

const mcpHealthUrl =
  "https://magic-brain-mcp.assarasua.workers.dev/healthz";

export async function GET() {
  try {
    const response = await fetch(mcpHealthUrl, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5_000),
      cache: "no-store",
    });
    if (!response.ok) {
      return Response.json(
        { status: "unavailable", upstreamStatus: response.status },
        { status: 502, headers: responseHeaders },
      );
    }
    const body = (await response.json()) as Record<string, unknown>;
    return Response.json(
      {
        status: body.status,
        server: body.server,
        version: body.version,
        transport: body.transport,
        authentication: body.authentication,
      },
      { headers: responseHeaders },
    );
  } catch {
    return Response.json(
      { status: "unavailable" },
      { status: 502, headers: responseHeaders },
    );
  }
}

const responseHeaders = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'",
  "X-Content-Type-Options": "nosniff",
};
