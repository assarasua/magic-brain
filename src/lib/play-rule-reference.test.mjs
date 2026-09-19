import assert from "node:assert/strict";
import test from "node:test";
import { fetchRuleReference, ruleServiceFetch } from "./play/rule-reference.ts";
import { readFileSync } from "node:fs";

const rules = {
  results: [
    {
      excerpt: "A commander costs an additional {2}.",
      citation: {
        ruleNumber: "903.8",
        section: "Commander",
        page: 251,
        sourceUrl: "https://magic.wizards.com/en/rules",
      },
    },
  ],
  source: { effectiveDate: "2026-08-07", freshnessNotice: "Snapshot" },
};

test("production rules use the MCP service binding with the same read-only request", async () => {
  const config = JSON.parse(
    readFileSync(new URL("../../wrangler.jsonc", import.meta.url), "utf8"),
  );
  assert.ok(
    config.services.some(
      (service) =>
        service.binding === "MAGIC_BRAIN_MCP" &&
        service.service === "magic-brain-mcp",
    ),
  );
  const result = await fetchRuleReference(
    "903.8",
    ruleServiceFetch({
      fetch: async (request) => {
        assert.equal(
          request.url,
          "https://magic-brain-mcp.assarasua.workers.dev/mcp",
        );
        assert.equal(request.method, "POST");
        assert.equal(request.redirect, "manual");
        assert.equal(request.headers.get("authorization"), null);
        assert.equal(request.headers.get("cookie"), null);
        assert.equal((await request.json()).params.name, "search_rules");
        return Response.json({ result: { structuredContent: rules } });
      },
    }),
  );
  assert.deepEqual(result, rules);
});
test("rule lookup accepts MCP streams and only forwards a bounded read-only query", async () => {
  const value = await fetchRuleReference(
    " commander tax ",
    async (url, options) => {
      assert.equal(url, "https://magic-brain-mcp.assarasua.workers.dev/mcp");
      assert.equal(options.redirect, "manual");
      assert.equal(options.headers.Cookie, undefined);
      const body = JSON.parse(options.body);
      assert.equal(body.params.name, "search_rules");
      assert.deepEqual(body.params.arguments, {
        query: "commander tax",
        limit: 5,
        max_excerpt_chars: 600,
      });
      return new Response(
        `event: message\ndata: ${JSON.stringify({ result: { structuredContent: rules } })}\n\n`,
      );
    },
  );
  assert.deepEqual(value, rules);
});
test("rule lookup rejects redirects instead of following them through the service binding", async () => {
  let requests = 0;
  await assert.rejects(
    fetchRuleReference(
      "903.8",
      ruleServiceFetch({
        fetch: async (request) => {
          requests += 1;
          assert.equal(request.redirect, "manual");
          return new Response(null, {
            status: 302,
            headers: { Location: "https://example.com/unexpected" },
          });
        },
      }),
    ),
    /unavailable/,
  );
  assert.equal(requests, 1);
});
test("rule lookup supports JSON text results and rejects invalid, oversized, rate-limited and error responses", async () => {
  assert.deepEqual(
    await fetchRuleReference("903.8", async () =>
      Response.json({
        result: { content: [{ type: "text", text: JSON.stringify(rules) }] },
      }),
    ),
    rules,
  );
  for (const query of [" ", "a", "a".repeat(201)])
    await assert.rejects(
      fetchRuleReference(query, async () => assert.fail("No request expected")),
      /query/,
    );
  for (const response of [
    Response.json({ result: { isError: true } }),
    Response.json({
      result: { structuredContent: { results: [], source: {} } },
    }),
    new Response(" ".repeat(100001)),
    new Response("", { status: 502 }),
  ])
    await assert.rejects(fetchRuleReference("903.8", async () => response));
  await assert.rejects(
    fetchRuleReference("903.8", async () => new Response("", { status: 429 })),
    /rateLimit/,
  );
});
