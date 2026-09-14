import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("authorization metadata uses the effective request origin", async () => {
  const route = await readFile(
    new URL(
      "../src/app/.well-known/oauth-authorization-server/route.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(route, /GET\(request: NextRequest\)/);
  assert.match(
    route,
    /authorizationServerMetadata\(request\.nextUrl\.origin\)/,
  );
});

test("DCR accepts Claude public-client metadata without issuing a secret", async () => {
  const route = await readFile(
    new URL("../src/app/oauth/register/route.ts", import.meta.url),
    "utf8",
  );
  const oauth = await readFile(
    new URL("../src/lib/oauth.ts", import.meta.url),
    "utf8",
  );
  assert.match(route, /token_endpoint_auth_method/);
  assert.match(oauth, /token_endpoint_auth_method: "none"/);
  assert.match(oauth, /grant_types: \["authorization_code", "refresh_token"\]/);
  assert.match(oauth, /response_types: \["code"\]/);
  assert.doesNotMatch(oauth, /client_secret:/);
  assert.match(route, /export function OPTIONS\(\)/);
  assert.match(route, /"Access-Control-Allow-Origin": "\*"/);
  assert.match(route, /"Access-Control-Allow-Methods": "POST, OPTIONS"/);
});
