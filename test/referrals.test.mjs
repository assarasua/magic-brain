import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
test("referral migration and auth enforce one attribution per new account", async () => {
  const migration = await readFile("db/030_referrals.sql", "utf8");
  const auth = await readFile("src/auth.ts", "utf8");
  const registry = await readFile("scripts/migrate.mjs", "utf8");
  assert.match(migration, /unique \(referred_user_id\)/);
  assert.match(migration, /referrer_user_id <> referred_user_id/);
  assert.match(auth, /on conflict \(referred_user_id\) do nothing/);
  assert.match(registry, /030_referrals\.sql/);
});

test("referral dashboard publishes share links without exposing full names", async () => {
  const referrals = await readFile("src/lib/referrals.ts", "utf8");
  assert.match(referrals, /\/login\?ref=/);
  assert.match(referrals, /parts\[0\].*parts\.at\(-1\)/s);
  assert.match(referrals, /dense_rank\(\) over \(order by referral_count desc\)/);
});
