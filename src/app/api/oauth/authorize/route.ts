import { auth } from "@/auth";
import { getOAuthClient, issueAuthorizationCode, parseScopes } from "@/lib/oauth";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ error: "invalid_request" }, { status: 403 });
  }
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "login_required" }, { status: 401 });
  const form = await request.formData();
  const clientId = String(form.get("client_id") ?? "");
  const redirectUri = String(form.get("redirect_uri") ?? "");
  const state = String(form.get("state") ?? "");
  const scopes = parseScopes(String(form.get("scope") ?? ""));
  const codeChallenge = String(form.get("code_challenge") ?? "");
  const client = await getOAuthClient(clientId, redirectUri);
  if (!client || !scopes || !/^[A-Za-z0-9_-]{43}$/.test(codeChallenge)) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  if (form.get("decision") !== "approve") {
    const denied = new URL(redirectUri);
    denied.searchParams.set("error", "access_denied");
    if (state) denied.searchParams.set("state", state);
    return Response.redirect(denied, 303);
  }
  const code = await issueAuthorizationCode({
    clientId,
    userId: session.user.id,
    redirectUri,
    scopes,
    codeChallenge,
  });
  const callback = new URL(redirectUri);
  callback.searchParams.set("code", code);
  if (state) callback.searchParams.set("state", state);
  return Response.redirect(callback, 303);
}
