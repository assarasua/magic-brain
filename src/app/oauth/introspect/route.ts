import { timingSafeEqual } from "node:crypto";
import {
  consumeOAuthRateLimit,
  oauthConfiguration,
  verifyOAuthAccessToken,
} from "@/lib/oauth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  await consumeOAuthRateLimit(request, "introspect", 120);
  if (!validServiceCredential(request.headers.get("authorization"))) {
    return Response.json(
      { error: "invalid_client" },
      {
        status: 401,
        headers: {
          "Cache-Control": "no-store",
          "WWW-Authenticate": 'Basic realm="Magic Brain OAuth introspection"',
        },
      },
    );
  }
  const form = await request.formData();
  const presented = form.get("token");
  if (typeof presented !== "string" || !presented) {
    return Response.json(
      { active: false },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  const token = await verifyOAuthAccessToken(presented);
  if (!token || token.resource !== oauthConfiguration().mcpResource) {
    return Response.json(
      { active: false },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  return Response.json(
    {
      active: true,
      client_id: token.client_id,
      sub: token.owner_id,
      scope: token.scopes.join(" "),
      exp: Number(token.expires_at),
      aud: token.resource,
      token_type: "Bearer",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

function validServiceCredential(header: string | null) {
  const expectedId = process.env.MAGIC_BRAIN_MCP_INTROSPECTION_CLIENT_ID;
  const expectedSecret = process.env.MAGIC_BRAIN_MCP_INTROSPECTION_SECRET;
  if (!expectedId || !expectedSecret || !header?.startsWith("Basic ")) {
    return false;
  }
  let decoded = "";
  try {
    decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  } catch {
    return false;
  }
  const separator = decoded.indexOf(":");
  if (separator < 0) return false;
  return (
    safeEqual(decoded.slice(0, separator), expectedId) &&
    safeEqual(decoded.slice(separator + 1), expectedSecret)
  );
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
