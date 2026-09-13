import { oauthConfiguration, OAUTH_SCOPES } from "@/lib/oauth";

export const runtime = "nodejs";

export function GET() {
  const { issuer, apiResource } = oauthConfiguration();
  return Response.json(
    {
      resource: apiResource,
      authorization_servers: [issuer],
      scopes_supported: OAUTH_SCOPES,
      bearer_methods_supported: ["header"],
      resource_documentation: `${issuer}/developers`,
    },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=300",
      },
    },
  );
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
    },
  });
}
