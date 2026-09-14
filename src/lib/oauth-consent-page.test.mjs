import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  consentContentSecurityPolicy,
  renderOAuthConsentErrorPage,
  renderOAuthConsentPage,
  trustedOAuthAppOrigin,
  trustedOAuthRedirectOrigin,
} from "./oauth-consent-page.ts";

test("renders a same-document consent form with complete fallback fields", () => {
  const html = renderOAuthConsentPage({
    clientName: "Claude",
    scopes: ["lists:read"],
    requestToken: "opaque-request",
    nonce: "nonce",
  });
  assert.match(html, /<form id="consent-form" method="post" action="">/);
  assert.doesNotMatch(html, /<base\b/i);
  const action = html.match(/<form[^>]* action="([^"]*)"/)?.[1];
  assert.equal(action, "");
  const effectivePage =
    "https://noncanonical.example/oauth/authorize?client_id=test";
  assert.equal(new URL(action, effectivePage).origin, new URL(effectivePage).origin);
  assert.match(html, /name="consent_request" value="opaque-request"/);
  assert.match(html, /name="decision_button"[^>]+value="allow"/);
  assert.match(html, /name="decision_button"[^>]+value="deny"/);
  assert.match(html, /role="status" aria-live="polite"/);
  assert.match(html, /let submitted=false/);
  assert.match(html, /if\(submitted\)\{event\.preventDefault\(\);return\}/);
  assert.match(html, /button\.disabled=true/);
  assert.match(html, /Connecting…/);
});

test("consent form escapes client, scope, request, and nonce values", () => {
  const html = renderOAuthConsentPage({
    clientName: "<script>",
    scopes: ['scope"onclick'],
    requestToken: 'request"><script>',
    nonce: 'nonce"><script>',
  });
  assert.doesNotMatch(html, /<script>.*<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /scope&quot;onclick/);
  assert.match(html, /request&quot;&gt;&lt;script&gt;/);
});

test("expired consent renders friendly reconnect UX without raw JSON", () => {
  const html = renderOAuthConsentErrorPage(
    "Consent request expired or already used",
  );
  assert.match(html, /This connection request can’t be completed/);
  assert.match(html, /Open reconnect instructions/);
  assert.match(html, /\/developers#mcp/);
  assert.doesNotMatch(html, /"error"\s*:/);
});

test("consent CSP permits only self and the canonical form destination", () => {
  const destination =
    "https://magicbrain.es/oauth/authorize?client_id=synthetic&state=synthetic";
  const policy = consentContentSecurityPolicy("nonce", "https://magicbrain.es");
  assert.match(
    policy,
    /form-action 'self' https:\/\/magicbrain\.es(?:;|$)/,
  );
  assert.equal(new URL(destination).origin, "https://magicbrain.es");
  assert.doesNotMatch(policy, /form-action[^;]*\*/);
  assert.doesNotMatch(policy, /form-action[^;]*\shttps:(?:\s|;|$)/);
  assert.doesNotMatch(policy, /claude\.(?:ai|com)/);
});

test("opaque or noncanonical contexts retain an explicit canonical source", () => {
  const policy = consentContentSecurityPolicy("nonce", "https://magicbrain.es/");
  const formAction = policy.match(/form-action ([^;]+)/)?.[1] ?? "";
  assert.equal(formAction, "'self' https://magicbrain.es");
  assert.equal(trustedOAuthAppOrigin("null"), "https://magicbrain.es");
  assert.equal(
    trustedOAuthAppOrigin("https://untrusted.example"),
    "https://magicbrain.es",
  );
  assert.equal(
    trustedOAuthAppOrigin("http://localhost:3000"),
    "http://localhost:3000",
  );
});

test("consent CSP permits only the validated registered callback origin", () => {
  const policy = consentContentSecurityPolicy(
    "nonce",
    "https://magicbrain.es",
    "https://claude.ai/api/mcp/auth_callback?synthetic=1",
  );
  const formAction = policy.match(/form-action ([^;]+)/)?.[1] ?? "";
  assert.equal(
    formAction,
    "'self' https://magicbrain.es https://claude.ai",
  );
  assert.equal(
    trustedOAuthRedirectOrigin("http://127.0.0.1:4321/callback"),
    "http://127.0.0.1:4321",
  );
  for (const unsafe of [
    "http://untrusted.example/callback",
    "javascript:alert(1)",
    "https://user:password@untrusted.example/callback",
    "not a URL",
  ]) {
    assert.equal(trustedOAuthRedirectOrigin(unsafe), null);
  }
  assert.doesNotMatch(formAction, /\*/);
  assert.doesNotMatch(formAction, /(?:^|\s)https:(?:\s|$)/);
  assert.doesNotMatch(formAction, /claude\.com/);
});

test("authorize route uses the strict consent CSP builder", async () => {
  const route = await readFile(
    new URL("../app/oauth/authorize/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(
    route,
    /consentContentSecurityPolicy\(\s*nonce,\s*undefined,\s*authorization\.redirectUri/,
  );
  assert.match(route, /consentContentSecurityPolicy\(\)/);
});
