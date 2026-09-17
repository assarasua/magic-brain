import { exchangeAuthorizationCode, refreshAccessToken } from "@/lib/oauth";

const oauthError = (error: string, status = 400) =>
  Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  const form = await request.formData();
  const grantType = String(form.get("grant_type") ?? "");
  const clientId = String(form.get("client_id") ?? "");
  if (!clientId) return oauthError("invalid_client", 401);

  if (grantType === "authorization_code") {
    const result = await exchangeAuthorizationCode({
      code: String(form.get("code") ?? ""),
      clientId,
      redirectUri: String(form.get("redirect_uri") ?? ""),
      codeVerifier: String(form.get("code_verifier") ?? ""),
    });
    return result ? Response.json(result, { headers: { "Cache-Control": "no-store" } }) : oauthError("invalid_grant");
  }

  if (grantType === "refresh_token") {
    const result = await refreshAccessToken(String(form.get("refresh_token") ?? ""), clientId);
    return result ? Response.json(result, { headers: { "Cache-Control": "no-store" } }) : oauthError("invalid_grant");
  }

  return oauthError("unsupported_grant_type");
}
