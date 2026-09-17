import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("new authenticated users are not silently added to the marketing audience", async () => {
  const auth = await readFile("src/auth.ts", "utf8");
  assert.doesNotMatch(auth, /subscribeToNewsletter/);
});

test("bulk audience sync is disabled to preserve explicit consent", async () => {
  const script = await readFile("scripts/sync-resend-audience.mjs", "utf8");
  assert.match(script, /explicit newsletter consent/);
  assert.doesNotMatch(script, /from app_users/);
});
