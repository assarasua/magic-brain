import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  ACCESS_TOKEN_SECONDS,
  AUTHORIZATION_CODE_SECONDS,
  CONSENT_REQUEST_SECONDS,
  REFRESH_TOKEN_SECONDS,
  parseScopes,
  pkceChallenge,
  validateRedirectUri,
} from "../src/lib/oauth-model.ts";

test("PKCE uses the RFC 7636 S256 challenge", () => {
  assert.equal(
    pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
    "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
  );
  assert.throws(() => pkceChallenge("short"), /code_verifier/);
});

test("redirect validation allows HTTPS and loopback only", () => {
  assert.equal(
    validateRedirectUri("https://client.example/callback"),
    "https://client.example/callback",
  );
  assert.equal(
    validateRedirectUri("http://127.0.0.1:43123/callback"),
    "http://127.0.0.1:43123/callback",
  );
  assert.throws(() => validateRedirectUri("http://client.example/callback"));
  assert.throws(() =>
    validateRedirectUri("https://client.example/callback#fragment"),
  );
});

test("scopes default least privilege and reject unknown values", () => {
  assert.deepEqual(parseScopes(undefined), ["public:read"]);
  assert.deepEqual(parseScopes("portfolio:read profile:read portfolio:read"), [
    "portfolio:read",
    "profile:read",
  ]);
  assert.throws(() => parseScopes("admin"));
});

test("OAuth lifetimes are bounded and rotation/replay protections are atomic", async () => {
  assert.equal(AUTHORIZATION_CODE_SECONDS, 300);
  assert.equal(CONSENT_REQUEST_SECONDS, 900);
  assert.equal(ACCESS_TOKEN_SECONDS, 900);
  assert.equal(REFRESH_TOKEN_SECONDS, 2_592_000);
  const source = await readFile(
    new URL("../src/lib/oauth.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /consumed_at is null/);
  assert.match(source, /set consumed_at = now\(\)/);
  assert.match(source, /set revoked_at = now\(\), rotated_at = now\(\)/);
  assert.match(source, /returning owner_id::text/);
  assert.doesNotMatch(source, /console\.(?:log|error).*token/i);
});

test("consent survives login without cookie state and is consumed once", async () => {
  const [oauthSource, routeSource, migration, runner] = await Promise.all([
    readFile(new URL("../src/lib/oauth.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../src/app/oauth/authorize/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../db/023_oauth_consent_requests.sql", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../scripts/migrate.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(routeSource, /callbackUrl=\$\{encodeURIComponent\(callback\)\}/);
  assert.match(routeSource, /createOAuthConsentRequest/);
  assert.match(routeSource, /consumeOAuthConsentRequest/);
  assert.doesNotMatch(routeSource, /mb_oauth_consent/);
  assert.match(oauthSource, /now\(\) \+ \(\$9::text \|\| ' seconds'\)::interval/);
  assert.match(oauthSource, /consent\.expires_at > now\(\)/);
  assert.match(oauthSource, /consent\.consumed_at is null/);
  assert.match(oauthSource, /set consumed_at = now\(\)/);
  assert.match(migration, /created_at timestamptz/);
  assert.match(migration, /expires_at timestamptz/);
  assert.match(migration, /consumed_at timestamptz/);
  assert.match(runner, /023_oauth_consent_requests\.sql/);
});

test("token endpoint returns invalid_client for stale DCR registrations", async () => {
  const [oauthSource, tokenRoute] = await Promise.all([
    readFile(new URL("../src/lib/oauth.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../src/app/oauth/token/route.ts", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(oauthSource, /requireOAuthTokenClient/);
  assert.match(oauthSource, /getClient\(clientId, 401\)/);
  assert.match(tokenRoute, /await requireOAuthTokenClient\(clientId\)/);
  assert.match(tokenRoute, /401, "invalid_client"/);
});

test("personal data ownership comes only from authenticated server context", async () => {
  const [accountSource, portfolioSource] = await Promise.all([
    readFile(
      new URL("../src/lib/public-api/account-data.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../src/lib/portfolio.ts", import.meta.url), "utf8"),
  ]);
  assert.match(accountSource, /getPortfolio\(ownerId, listId\)/);
  assert.match(portfolioSource, /where i\.user_id = \$1/);
  assert.doesNotMatch(accountSource, /searchParams.*user|body.*owner/i);
});
