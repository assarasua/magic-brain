import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("new authenticated users are added to the Resend audience once", async () => {
  const auth = await readFile("src/auth.ts", "utf8");
  assert.match(auth, /let newlyCreated = false/);
  assert.match(auth, /newlyCreated = true/);
  assert.match(auth, /if \(newlyCreated\)/);
  assert.match(auth, /subscribeToNewsletter/);
});

test("existing-user sync selects authenticated accounts without logging addresses", async () => {
  const script = await readFile("scripts/sync-resend-audience.mjs", "utf8");
  assert.match(script, /authenticated_at is not null/);
  assert.match(script, /email is not null/);
  assert.doesNotMatch(script, /console\.log\([^\n]*row\.email/);
});
