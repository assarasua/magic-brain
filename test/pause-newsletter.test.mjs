import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

const fixtureKey = "magic-brain.pause-newsletter-test";
const databaseModule = `data:text/javascript,${encodeURIComponent(`
  export const query = (...args) => globalThis[Symbol.for("${fixtureKey}")].query(...args);
`)}`;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/db") return { url: databaseModule, shortCircuit: true };
    if (specifier.startsWith("@/lib/")) return nextResolve(new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url).href, context);
    return nextResolve(specifier, context);
  },
});
const { POST } = await import("../src/app/api/newsletter/route.ts");
function request(body, origin = "https://magicbrain.es") {
  return new Request("https://magicbrain.es/api/newsletter", {
    method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(body),
  });
}

test("newsletter rejects invalid origin, missing consent and invalid email without any side effects", async (t) => {
  t.mock.method(globalThis, "fetch", () => { throw new Error("Unexpected external call"); });
  globalThis[Symbol.for(fixtureKey)] = { query() { throw new Error("Unexpected database write"); } };
  assert.equal((await POST(request({ email: "test@example.com", consent: "yes" }, "https://untrusted.example"))).status, 403);
  assert.equal((await POST(request({ email: "test@example.com" }))).status, 400);
  assert.equal((await POST(request({ email: "bad", consent: "yes" }))).status, 400);
  assert.equal((await POST(request({ email: "bot@example.com", website: "bot", consent: "yes" }))).status, 200);
});

test("opted-in signup persists the normalized contact without a database dependency or sending email", async (t) => {
  const priorKey = process.env.RESEND_API_KEY;
  const priorAudience = process.env.RESEND_AUDIENCE_ID;
  process.env.RESEND_API_KEY = "synthetic-test-key";
  process.env.RESEND_AUDIENCE_ID = "synthetic-audience";
  t.after(() => {
    if (priorKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = priorKey;
    if (priorAudience === undefined) delete process.env.RESEND_AUDIENCE_ID; else process.env.RESEND_AUDIENCE_ID = priorAudience;
  });
  const calls = [], writes = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return Response.json({ id: "synthetic-contact" });
  });
  globalThis[Symbol.for(fixtureKey)] = { query: async (sql, params) => { writes.push({ sql, params }); } };
  const response = await POST(request({ email: "  PERSON@EXAMPLE.COM ", consent: "yes", website: "" }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(calls, [{ url: "https://api.resend.com/audiences/synthetic-audience/contacts", body: { email: "person@example.com", unsubscribed: false } }]);
  assert.equal(writes.length, 0);
});

test("provider failure never claims the subscription succeeded", async (t) => {
  t.mock.method(globalThis, "fetch", async () => { throw new Error("Provider unavailable"); });
  const response = await POST(request({ email: "test@example.com", consent: "yes" }));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).ok, undefined);
});
