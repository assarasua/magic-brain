import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  renderOAuthConsentErrorPage,
  renderOAuthConsentPage,
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

test("authorize route keeps form submissions restricted to self", async () => {
  const route = await readFile(
    new URL("../app/oauth/authorize/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(route, /form-action 'self'/);
  assert.doesNotMatch(route, /form-action https?:/);
});
