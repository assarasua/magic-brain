import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createShareToken,
  hashShareToken,
  isShareActive,
  isValidShareToken,
  SHARE_LIFETIME_MS,
} from "../src/lib/portfolio-share-model.ts";

const root = new URL("../", import.meta.url);

test("share tokens are high entropy and only their hashes are stable", () => {
  const first = createShareToken();
  const second = createShareToken();
  assert.equal(isValidShareToken(first), true);
  assert.equal(Buffer.from(first, "base64url").byteLength, 32);
  assert.notEqual(first, second);
  assert.equal(hashShareToken(first)?.byteLength, 32);
  assert.notEqual(hashShareToken(first)?.toString("hex"), first);
  assert.equal(isValidShareToken("malformed"), false);
  assert.equal(hashShareToken("malformed"), null);
});

test("share expiry uses an exclusive exact 24-hour boundary", () => {
  const created = new Date("2026-09-13T12:00:00.000Z");
  const expires = new Date(created.getTime() + SHARE_LIFETIME_MS);
  assert.equal(
    isShareActive(expires, null, new Date(expires.getTime() - 1)),
    true,
  );
  assert.equal(isShareActive(expires, null, expires), false);
  assert.equal(
    isShareActive(expires, new Date(created.getTime() + 1), created),
    false,
  );
});

test("migration scopes shares to owners and deletes them with lists", async () => {
  const migration = await readFile(
    new URL("db/020_portfolio_list_shares.sql", root),
    "utf8",
  );
  const runner = await readFile(new URL("scripts/migrate.mjs", root), "utf8");
  assert.match(migration, /foreign key \(list_id, user_id\)/);
  assert.match(migration, /on delete cascade/);
  assert.match(migration, /token_hash bytea not null unique/);
  assert.match(migration, /expires_at = created_at \+ interval '24 hours'/);
  assert.ok(
    runner.indexOf('"020_portfolio_list_shares.sql"') >
      runner.indexOf('"019_portfolio_lists.sql"'),
  );
});

test("public lookup omits private fields and enforces revocation and expiry", async () => {
  const implementation = await readFile(
    new URL("src/lib/portfolio-share.ts", root),
    "utf8",
  );
  const publicProjection = implementation.slice(
    implementation.indexOf("export async function getPublicPortfolioShare"),
  );
  assert.match(publicProjection, /share\.revoked_at is null/);
  assert.match(publicProjection, /share\.expires_at > now\(\)/);
  assert.doesNotMatch(
    publicProjection,
    /purchase_price|purchasePrice|cost_basis|acquired_at|notes|email|preferences|cohort|modelVersion/,
  );
});

test("public route bypass is limited to shared portfolio pages", async () => {
  const shell = await readFile(
    new URL("src/components/app-shell.tsx", root),
    "utf8",
  );
  const publicRoute = await readFile(
    new URL("src/app/api/shared/portfolio/[token]/route.ts", root),
    "utf8",
  );
  assert.match(shell, /pathname\.startsWith\("\/shared\/portfolio\/"\)/);
  assert.match(publicRoute, /private, no-store/);
  assert.doesNotMatch(publicRoute, /Access-Control-Allow-Origin/i);
});
