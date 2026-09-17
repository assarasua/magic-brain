export function GET() {
  return Response.json(
    {
      issuer: "https://magicbrain.es",
      authorization_endpoint: "https://magicbrain.es/oauth/authorize",
      token_endpoint: "https://magicbrain.es/api/oauth/token",
      registration_endpoint: "https://magicbrain.es/api/oauth/register",
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: ["none"],
      code_challenge_methods_supported: ["S256"],
      scopes_supported: [
        "portfolio:read",
        "portfolio:write",
        "watchlist:read",
        "watchlist:write",
      ],
    },
    { headers: { "Cache-Control": "public, max-age=3600", "Access-Control-Allow-Origin": "*" } },
  );
}
