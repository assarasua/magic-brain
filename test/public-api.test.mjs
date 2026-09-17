import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  ApiError,
  assertDateRange,
  assertOnlyParameters,
  decodeCursor,
  encodeCursor,
  LocalRateLimiter,
  optionalDate,
  parseInteger,
} from "../src/lib/public-api/core.ts";
import { publicApiOpenApi } from "../src/lib/public-api/openapi.ts";

test("cursor round trips and rejects malformed input", () => {
  const encoded = encodeCursor({ name: "black lotus", id: "card-id" });
  assert.deepEqual(decodeCursor(encoded, ["name", "id"]), {
    v: 1,
    name: "black lotus",
    id: "card-id",
  });
  assert.throws(
    () => decodeCursor("not-a-cursor", ["name", "id"]),
    (error) => error instanceof ApiError && error.code === "invalid_cursor",
  );
});

test("account routes require scoped keys and preserve privacy boundaries", async () => {
  for (const route of [
    "src/app/api/v1/ml/opportunities/route.ts",
    "src/app/api/v1/portfolio/route.ts",
    "src/app/api/v1/predict/recommendation/route.ts",
  ]) {
    const source = await readFile(new URL(`../${route}`, import.meta.url), "utf8");
    assert.match(source, /allowAnonymous: false/);
    assert.match(source, /requiredScopes: \[(?:"portfolio:read", "profile:read"|"profile:read")\]/);
  }
  const accountData = await readFile(
    new URL("../src/lib/public-api/account-data.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(accountData, /\bemail\b|\bdisplayName\b/);
  assert.match(accountData, /ownerIdentityIncluded: false/);
  assert.match(accountData, /requestTimeTraining: false/);
});

test("account scope migration remains additive and requires data read", async () => {
  const migration = await readFile(
    new URL("../db/021_public_api_account_scope.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /'portfolio:read'/);
  assert.match(migration, /scopes @> array\['data:read'\]/);
  assert.doesNotMatch(migration, /drop table|truncate/i);
});

test("list and share mutations require scopes, confirmation, and idempotency", async () => {
  const [lists, bulk, shares, mutationHelper, publicShare] = await Promise.all([
    readFile(
      new URL("../src/app/api/v1/portfolio/lists/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../src/app/api/v1/portfolio/bulk/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../src/app/api/v1/portfolio/lists/[id]/shares/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../src/lib/public-api/mutations.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../src/lib/portfolio-share.ts", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(lists, /requiredScopes: \["lists:write"\]/);
  assert.match(bulk, /"portfolio:write", "lists:write"/);
  assert.match(shares, /requiredScopes: \["shares:manage"\]/);
  assert.match(mutationHelper, /body\.confirm !== true/);
  assert.match(mutationHelper, /idempotency-key/);
  assert.match(mutationHelper, /request_hash/);
  assert.match(publicShare, /createHmac\("sha256", secret\)/);
  assert.match(publicShare, /idempotency_key_hash/);
  assert.doesNotMatch(
    publicShare.slice(publicShare.indexOf("type PublicHoldingRow")),
    /purchase_price|owner_id|email/,
  );
});

test("integer and query validation enforce the public contract", () => {
  assert.equal(
    parseInteger(null, "limit", { defaultValue: 50, min: 1, max: 100 }),
    50,
  );
  assert.equal(
    parseInteger("100", "limit", { defaultValue: 50, min: 1, max: 100 }),
    100,
  );
  assert.throws(
    () =>
      parseInteger("101", "limit", {
        defaultValue: 50,
        min: 1,
        max: 100,
      }),
    (error) => error instanceof ApiError && error.code === "invalid_parameter",
  );
  assert.throws(
    () => assertOnlyParameters(new URLSearchParams("limit=2&offset=4"), ["limit"]),
    /Unknown parameter: offset/,
  );
});

test("date validation rejects impossible and oversized ranges", () => {
  assert.equal(optionalDate("2026-09-13", "from"), "2026-09-13");
  assert.throws(() => optionalDate("2026-02-30", "from"), /not a valid date/);
  assert.doesNotThrow(() => assertDateRange("2026-01-01", "2027-01-01"));
  assert.throws(
    () => assertDateRange("2026-01-01", "2027-01-02"),
    (error) => error instanceof ApiError && error.code === "invalid_date_range",
  );
  assert.throws(() => assertDateRange("2026-02-01", "2026-01-01"));
});

test("local rate limiter resets and never reports negative remaining", () => {
  const limiter = new LocalRateLimiter(2, 1_000);
  assert.deepEqual(limiter.consume("client", 0), {
    success: true,
    limit: 2,
    remaining: 1,
    retryAfter: 1,
  });
  assert.equal(limiter.consume("client", 10).success, true);
  const denied = limiter.consume("client", 20);
  assert.equal(denied.success, false);
  assert.equal(denied.remaining, 0);
  assert.equal(limiter.consume("client", 1_001).success, true);
});

test("OpenAPI advertises every v1 data and key route", () => {
  assert.deepEqual(Object.keys(publicApiOpenApi.paths).sort(), [
    "/api-keys",
    "/api-keys/{id}",
    "/alerts",
    "/cards",
    "/cards/{id}",
    "/cards/{id}/prices",
    "/latest-set/opportunities",
    "/market/movers",
    "/ml/opportunities",
    "/news",
    "/news/latest",
    "/news/{date}",
    "/openapi.json",
    "/opportunity-graph",
    "/portfolio",
    "/portfolio/lists",
    "/portfolio/lists/{id}",
    "/portfolio/bulk",
    "/portfolio/lists/{id}/shares",
    "/portfolio/lists/{id}/shares/{shareId}",
    "/shared/portfolio/{token}",
    "/predict/portfolio",
    "/predict/recommendation",
    "/predict/set",
    "/prices/latest",
    "/sets",
  ].sort());
  assert.equal(publicApiOpenApi.openapi, "3.1.0");
  assert.equal(
    publicApiOpenApi.components.schemas.Price.properties.currency.const,
    "EUR",
  );
  assert.equal(
    publicApiOpenApi.paths["/predict/portfolio"].post.requestBody.content[
      "application/json"
    ].schema.additionalProperties,
    false,
  );
  assert.equal(
    publicApiOpenApi.paths["/news"].get.parameters[0].schema.maximum,
    30,
  );
  assert.deepEqual(
    publicApiOpenApi.paths["/portfolio"].get.security,
    [
      { OAuth2: ["portfolio:read", "profile:read"] },
      { ApiKey: ["portfolio:read", "profile:read"] },
    ],
  );
  assert.match(
    publicApiOpenApi.paths["/ml/opportunities"].get.responses["200"].description,
    /fallback/,
  );
});
