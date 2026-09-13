import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  OAuthConsentLifecycleError,
  finalizeOAuthConsent,
} from "../src/lib/oauth-consent-lifecycle.ts";

const grant = {
  clientId: "client",
  redirectUri: "https://claude.ai/api/mcp/auth_callback",
  resource: "https://mcp.example/mcp",
  state: "state",
  scopes: ["public:read"],
  challenge: "challenge",
};

class FakeConsentStore {
  constructor({ expiresAt = 1_000 } = {}) {
    this.now = 100;
    this.expiresAt = expiresAt;
    this.consumed = false;
    this.codes = [];
    this.audits = [];
    this.queue = Promise.resolve();
    this.failCodeInsert = false;
  }

  inspect() {
    return this.consumed ? null : grant;
  }

  async transaction(operation) {
    let unlock;
    const previous = this.queue;
    this.queue = new Promise((resolve) => {
      unlock = resolve;
    });
    await previous;
    const snapshot = {
      consumed: this.consumed,
      codes: [...this.codes],
      audits: [...this.audits],
    };
    try {
      return await operation({
        consume: async (ownerId, token) => {
          if (
            ownerId !== "owner" ||
            token !== "mbcr_token" ||
            this.consumed ||
            this.expiresAt <= this.now
          ) {
            return null;
          }
          this.consumed = true;
          return grant;
        },
        issueAuthorizationCode: async () => {
          if (this.failCodeInsert) throw new Error("insert failed");
          const code = `code-${this.codes.length + 1}`;
          this.codes.push(code);
          this.audits.push("authorization_granted");
          return code;
        },
        recordDenial: async () => {
          this.audits.push("authorization_denied");
        },
      });
    } catch (error) {
      this.consumed = snapshot.consumed;
      this.codes = snapshot.codes;
      this.audits = snapshot.audits;
      throw error;
    } finally {
      unlock();
    }
  }
}

const allow = (store) =>
  finalizeOAuthConsent(store, {
    ownerId: "owner",
    requestToken: "mbcr_token",
    decision: "allow",
    requestId: null,
  });

test("Claude login round-trip and repeated consent reads do not consume", async () => {
  const store = new FakeConsentStore();
  assert.equal(store.inspect(), grant);
  assert.equal(store.inspect(), grant);
  assert.equal(store.consumed, false);

  const completion = await allow(store);
  assert.equal(completion.decision, "allow");
  assert.equal(completion.code, "code-1");
  assert.equal(store.codes.length, 1);
  assert.deepEqual(store.audits, ["authorization_granted"]);
});

test("duplicate Allow is rejected without issuing another code", async () => {
  const store = new FakeConsentStore();
  await allow(store);
  await assert.rejects(() => allow(store), OAuthConsentLifecycleError);
  assert.deepEqual(store.codes, ["code-1"]);
});

test("consent expiry boundary is exclusive", async () => {
  const store = new FakeConsentStore({ expiresAt: 100 });
  await assert.rejects(() => allow(store), OAuthConsentLifecycleError);
  assert.equal(store.consumed, false);
  assert.equal(store.codes.length, 0);
});

test("concurrent Allow race issues exactly one authorization code", async () => {
  const store = new FakeConsentStore();
  const results = await Promise.allSettled([allow(store), allow(store)]);
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal(
    results.filter((result) => result.status === "rejected").length,
    1,
  );
  assert.deepEqual(store.codes, ["code-1"]);
});

test("code insertion failure rolls back consent consumption", async () => {
  const store = new FakeConsentStore();
  store.failCodeInsert = true;
  await assert.rejects(() => allow(store), /insert failed/);
  assert.equal(store.consumed, false);
  store.failCodeInsert = false;
  await allow(store);
  assert.deepEqual(store.codes, ["code-1"]);
});

test("authorize GET stays read-only and POST validates before completion", async () => {
  const source = await readFile(
    new URL("../src/app/oauth/authorize/route.ts", import.meta.url),
    "utf8",
  );
  const [beforePost, postSource] = source.split("export async function POST");
  const getSource = beforePost.slice(
    beforePost.indexOf("export async function GET"),
  );
  assert.doesNotMatch(getSource, /await completeOAuthConsentRequest/);
  assert.ok(
    postSource.indexOf('decision !== "allow"') <
      postSource.indexOf("completeOAuthConsentRequest"),
  );
  assert.doesNotMatch(postSource, /createAuthorizationCode/);
});

test("production completion uses one database transaction", async () => {
  const source = await readFile(
    new URL("../src/lib/oauth.ts", import.meta.url),
    "utf8",
  );
  const lifecycle = source.slice(
    source.indexOf("export async function completeOAuthConsentRequest"),
    source.indexOf("export async function exchangeAuthorizationCode"),
  );
  assert.match(lifecycle, /client\.query\("begin"\)/);
  assert.match(lifecycle, /client\.query\("commit"\)/);
  assert.match(lifecycle, /client\.query\("rollback"\)/);
  assert.match(lifecycle, /consent\.consumed_at is null/);
  assert.match(lifecycle, /consent\.expires_at > now\(\)/);
  assert.match(lifecycle, /insert into app_oauth_authorization_codes/);
});
