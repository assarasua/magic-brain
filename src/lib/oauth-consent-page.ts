const CANONICAL_APP_ORIGIN = "https://magicbrain.es";

export function trustedOAuthAppOrigin(
  configured = process.env.NEXT_PUBLIC_APP_URL,
) {
  try {
    const url = new URL(configured ?? CANONICAL_APP_ORIGIN);
    const isOriginOnly =
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash;
    const isCanonical = url.origin === CANONICAL_APP_ORIGIN;
    const isLoopback =
      url.protocol === "http:" &&
      (url.hostname === "localhost" ||
        url.hostname === "127.0.0.1" ||
        url.hostname === "[::1]");
    return isOriginOnly && (isCanonical || isLoopback)
      ? url.origin
      : CANONICAL_APP_ORIGIN;
  } catch {
    return CANONICAL_APP_ORIGIN;
  }
}

export function consentContentSecurityPolicy(
  nonce?: string,
  configuredOrigin?: string,
  registeredRedirectUri?: string,
) {
  const scriptSource =
    nonce && /^[A-Za-z0-9_-]+$/.test(nonce)
      ? `'nonce-${nonce}'`
      : "'none'";
  const formOrigins = new Set([trustedOAuthAppOrigin(configuredOrigin)]);
  const redirectOrigin = trustedOAuthRedirectOrigin(registeredRedirectUri);
  if (redirectOrigin) formOrigins.add(redirectOrigin);
  return `default-src 'none'; style-src 'unsafe-inline'; script-src ${scriptSource}; form-action 'self' ${[...formOrigins].join(" ")}; base-uri 'none'; frame-ancestors 'none'`;
}

export function trustedOAuthRedirectOrigin(redirectUri?: string) {
  if (!redirectUri) return null;
  try {
    const url = new URL(redirectUri);
    if (url.username || url.password) return null;
    const isHttps = url.protocol === "https:";
    const isLoopbackHttp =
      url.protocol === "http:" &&
      (url.hostname === "localhost" ||
        url.hostname === "127.0.0.1" ||
        url.hostname === "[::1]");
    return isHttps || isLoopbackHttp ? url.origin : null;
  } catch {
    return null;
  }
}

export function renderOAuthConsentPage(input: {
  clientName: string;
  scopes: readonly string[];
  requestToken: string;
  nonce: string;
}) {
  const scopes = input.scopes
    .map((scope) => `<li><strong>${escapeHtml(scope)}</strong></li>`)
    .join("");
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Authorize Magic Brain</title><style>:root{color-scheme:light dark}body{font:16px system-ui;max-width:42rem;margin:4rem auto;padding:1rem;color:CanvasText;background:Canvas}main{border:1px solid color-mix(in srgb,CanvasText 18%,transparent);border-radius:16px;padding:2rem}h1{margin-top:0}li{margin:.5rem 0}p{line-height:1.55}.actions{display:flex;gap:.6rem;margin-top:1.5rem}button{padding:.75rem 1rem;border:1px solid color-mix(in srgb,CanvasText 24%,transparent);border-radius:.55rem;font:inherit;font-weight:700;cursor:pointer}button[value=allow]{background:#1479b8;color:white;border-color:#1479b8}button:disabled{opacity:.58;cursor:wait}.status{min-height:1.5rem;margin-top:1rem;color:GrayText}</style><main><h1>Connect ${escapeHtml(input.clientName)} to Magic Brain?</h1><p>This client is requesting these permissions:</p><ul>${scopes}</ul><p>If you allow access, Magic Brain will remember this client and these scopes so it can stay connected using rotating refresh tokens. New permissions or a new client registration require consent again. You can revoke access later.</p><p>Magic Brain never sends your Google credentials to the client.</p><form id="consent-form" method="post" action=""><input type="hidden" name="consent_request" value="${escapeHtml(input.requestToken)}"><input id="decision" type="hidden" name="decision" value=""><div class="actions"><button name="decision_button" data-decision="allow" value="allow" type="submit">Allow and continue</button><button name="decision_button" data-decision="deny" value="deny" type="submit">Deny</button></div><p id="submit-status" class="status" role="status" aria-live="polite"></p></form></main><script nonce="${escapeHtml(input.nonce)}">(()=>{const form=document.getElementById("consent-form");const decision=document.getElementById("decision");const status=document.getElementById("submit-status");let submitted=false;form.addEventListener("submit",event=>{if(submitted){event.preventDefault();return}const value=event.submitter?.dataset.decision;if(value!=="allow"&&value!=="deny"){event.preventDefault();return}decision.value=value;submitted=true;for(const button of form.querySelectorAll("button"))button.disabled=true;status.textContent=value==="allow"?"Connecting…":"Returning to the client…"});})();</script></html>`;
}

export function renderOAuthConsentErrorPage(message: string) {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Reconnect Magic Brain</title><style>:root{color-scheme:light dark}body{font:16px system-ui;max-width:38rem;margin:4rem auto;padding:1rem;color:CanvasText;background:Canvas}main{border:1px solid color-mix(in srgb,CanvasText 18%,transparent);border-radius:16px;padding:2rem}h1{margin-top:0}p{line-height:1.55}a{display:inline-block;margin-top:1rem;padding:.75rem 1rem;border-radius:.55rem;background:#1479b8;color:white;text-decoration:none;font-weight:700}</style><main><h1>This connection request can’t be completed</h1><p>${escapeHtml(message)}. No additional access was granted.</p><p>Return to Claude and start the Magic Brain connection again. If a previous Allow succeeded, Claude can safely retry the callback while its one-time code is still pending.</p><a href="/developers#mcp">Open reconnect instructions</a></main></html>`;
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
}
