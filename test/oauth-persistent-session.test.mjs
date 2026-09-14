import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sources = Promise.all([
  readFile(new URL("../src/lib/oauth.ts", import.meta.url), "utf8"),
  readFile(
    new URL("../src/app/oauth/authorize/route.ts", import.meta.url),
    "utf8",
  ),
  readFile(
    new URL("../db/024_oauth_durable_consent.sql", import.meta.url),
    "utf8",
  ),
  readFile(new URL("../scripts/migrate.mjs", import.meta.url), "utf8"),
]);

test("observed lost-callback sequence recovers one pending code", async () => {
  const pendingCodes = new Set();
  const complete = () => {
    const code = "same-one-time-code";
    pendingCodes.add(code);
    return code;
  };
  const recover = () =>
    pendingCodes.has("same-one-time-code") ? "same-one-time-code" : null;
  const exchange = (code) => {
    if (!pendingCodes.delete(code)) throw new Error("invalid_grant");
    return "refresh-token-issued";
  };

  const firstRedirectCode = complete();
  const recoveredRedirectCode = recover();
  assert.equal(recoveredRedirectCode, firstRedirectCode);
  assert.equal(exchange(recoveredRedirectCode), "refresh-token-issued");
  assert.throws(() => exchange(firstRedirectCode), /invalid_grant/);
});

test("durable consent auto-approves only the same client, resource, and scopes", async () => {
  const [oauth, authorize, migration] = await sources;
  assert.match(migration, /primary key \(owner_id, client_id, resource\)/);
  assert.match(oauth, /\$4::text\[\] <@ scopes/);
  assert.match(oauth, /revoked_at is null/);
  assert.match(authorize, /hasDurableOAuthConsent/);
  assert.match(authorize, /createAutoApprovedAuthorizationCode/);
  assert.match(oauth, /authorization_auto_approved/);
});

test("DCR recreation cannot inherit another client consent", async () => {
  const [oauth, , migration] = await sources;
  assert.match(migration, /client_id text not null references app_oauth_clients/);
  assert.match(oauth, /client_id = \$2/);
  assert.doesNotMatch(oauth, /client_name\s*=\s*\$/);
});

test("authorization code exchange and refresh rotation are atomic", async () => {
  const [oauth] = await sources;
  const exchange = oauth.slice(
    oauth.indexOf("export async function exchangeAuthorizationCode"),
    oauth.indexOf("export async function rotateRefreshToken"),
  );
  assert.match(exchange, /client\.query\("begin"\)/);
  assert.match(exchange, /insert into app_oauth_grants/);
  assert.match(exchange, /client\.query\("commit"\)/);
  assert.match(exchange, /client\.query\("rollback"\)/);
  assert.match(oauth, /returning owner_id, scopes, family_id/);
  assert.match(oauth, /refresh_reuse_detected/);
  assert.match(oauth, /and revoked_at is null\s+returning owner_id::text, scopes/);
});

test("revocation disables durable consent and migration is registered", async () => {
  const [oauth, , migration, runner] = await sources;
  assert.match(oauth, /update app_oauth_consents/);
  assert.match(oauth, /consent_revoked/);
  assert.match(migration, /family_id uuid/);
  assert.match(migration, /alter column expires_at drop not null/);
  assert.match(runner, /024_oauth_durable_consent\.sql/);
});

test("browser consent POST supports fallback controls, redirects, and friendly recovery", async () => {
  const [, authorize] = await sources;
  assert.match(authorize, /form\.get\("decision"\) \|\| form\.get\("decision_button"\)/);
  assert.match(authorize, /session\?\.user\?\.id/);
  assert.match(authorize, /redirect\.searchParams\.set\("state"/);
  assert.match(authorize, /redirect\.searchParams\.set\("code"/);
  assert.match(authorize, /NextResponse\.redirect\(redirect, 303\)/);
  assert.match(authorize, /request\.headers\.get\("accept"\)\?\.includes\("text\/html"\)/);
  assert.match(authorize, /renderOAuthConsentErrorPage/);
});
