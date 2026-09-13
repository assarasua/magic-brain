import assert from "node:assert/strict";
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
    "/cards",
    "/cards/{id}",
    "/cards/{id}/prices",
    "/latest-set/opportunities",
    "/news",
    "/news/latest",
    "/news/{date}",
    "/openapi.json",
    "/predict/portfolio",
    "/predict/set",
    "/prices/latest",
    "/sets",
  ]);
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
});
