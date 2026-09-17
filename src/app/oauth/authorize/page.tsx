import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { auth } from "@/auth";
import { getOAuthClient, parseScopes } from "@/lib/oauth";
import { MagicBrainLogo } from "@/components/brand-logo";

const scopeLabels: Record<string, string> = {
  "portfolio:read": "View your portfolio",
  "portfolio:write": "Add and remove portfolio holdings",
  "watchlist:read": "View your watchlist",
  "watchlist:write": "Add and remove watchlist cards",
};

export default async function OAuthAuthorizePage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const value = (name: string) => typeof params[name] === "string" ? params[name] : "";
  const clientId = value("client_id");
  const redirectUri = value("redirect_uri");
  const scope = value("scope");
  const scopes = parseScopes(scope);
  const client = await getOAuthClient(clientId, redirectUri);
  const valid = value("response_type") === "code" && value("code_challenge_method") === "S256" &&
    /^[A-Za-z0-9_-]{43}$/.test(value("code_challenge")) && client && scopes;
  if (!valid) return <main className="oauth-page"><div className="oauth-card"><MagicBrainLogo /><h1>Invalid authorization request</h1><p>Return to your MCP client and try connecting again.</p></div></main>;

  const session = await auth();
  if (!session?.user?.id) {
    const callbackParams = new URLSearchParams();
    for (const name of ["client_id", "redirect_uri", "response_type", "scope", "state", "code_challenge", "code_challenge_method", "resource"]) {
      const fieldValue = value(name);
      if (fieldValue) callbackParams.set(name, fieldValue);
    }
    const callback = `/oauth/authorize?${callbackParams.toString()}`;
    redirect(`/login?callbackUrl=${encodeURIComponent(callback)}`);
  }

  return (
    <main className="oauth-page">
      <div className="oauth-card">
        <MagicBrainLogo />
        <span><ShieldCheck size={16} /> Secure account connection</span>
        <h1>Connect {client.name} to Magic Brain?</h1>
        <p>This client is requesting permission to use your Magic: The Gathering data.</p>
        <ul>{scopes.map((item) => <li key={item}>{scopeLabels[item]}</li>)}</ul>
        <form action="/api/oauth/authorize" method="post">
          {[
            ["client_id", clientId], ["redirect_uri", redirectUri], ["scope", scope],
            ["state", value("state")], ["code_challenge", value("code_challenge")],
          ].map(([name, fieldValue]) => <input key={name} type="hidden" name={name} value={fieldValue} />)}
          <button type="submit" name="decision" value="approve">Allow access</button>
          <button type="submit" name="decision" value="deny" className="secondary">Cancel</button>
        </form>
        <small>You can disconnect access from your MCP client. Magic Brain never shares your Google password.</small>
      </div>
    </main>
  );
}
