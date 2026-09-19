import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import { ApiError, encodeCursor } from "../src/lib/public-api/core.ts";
import { publicApiOpenApi } from "../src/lib/public-api/openapi.ts";

const routeFixtureKey = "magic-brain.card-rules-api-test";
const databaseModule = `data:text/javascript,${encodeURIComponent(`
  export const query = (...args) => globalThis[Symbol.for("${routeFixtureKey}")].query(...args);
`)}`;
const accessModule = `data:text/javascript,${encodeURIComponent(`
  export async function authorizePublicRequest(request, policy) {
    const fixture = globalThis[Symbol.for("${routeFixtureKey}")];
    fixture.authorizations.push({ request, policy });
    if (fixture.accessError) throw fixture.accessError;
    return fixture.access;
  }
`)}`;

// The app uses bundler resolution; keep the repository tests on Node's native TS loader.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/db" && context.parentURL?.endsWith("/card-rules.ts")) {
      return { url: databaseModule, shortCircuit: true };
    }
    if (specifier === "./access" && context.parentURL?.endsWith("/public-api/http.ts")) {
      return { url: accessModule, shortCircuit: true };
    }
    if (specifier.startsWith("@/lib/public-api/")) {
      return nextResolve(new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url).href, context);
    }
    if (["./core", "./card-rules-core"].includes(specifier) && context.parentURL?.includes("/public-api/")) {
      return nextResolve(`${specifier}.ts`, context);
    }
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    return nextResolve(specifier, context);
  },
});
const {
  createCardRulesReader,
  parseCardRulesParameters,
  parseCardEffectsParameters,
} = await import("../src/lib/public-api/card-rules-core.ts");
const cardRulesRoute = await import("../src/app/api/v1/card-rules/route.ts");
const cardEffectsRoute = await import("../src/app/api/v1/card-effects/route.ts");
const { NextRequest } = await import("next/server");

const datasetId = "11111111-1111-4111-8111-111111111111";
const oracleId = "22222222-2222-4222-8222-222222222222";
const printingId = "33333333-3333-4333-8333-333333333333";
const secondOracleId = "44444444-4444-4444-8444-444444444444";
const descriptor = {
  provider: "scryfall",
  url: "https://data.scryfall.io/oracle-cards/oracle-cards.json",
  updatedAt: "2026-09-19T09:00:00Z",
  fetchedAt: "2026-09-19T12:00:00Z",
  sha256: "a".repeat(64),
};
const dataset = {
  id: datasetId,
  imported_at: "2026-09-19 12:01:00+00",
  oracle_source: descriptor,
  rulings_source: { ...descriptor, url: "https://data.scryfall.io/rulings/rulings.json" },
  card_count: 3,
  effect_count: 4,
  ruling_count: 51,
};
const face = {
  faceIndex: 0,
  name: "Front Face",
  typeLine: "Creature — Test",
  manaCost: "{2}{U}",
  oracleText: "Flying\nWhen this creature enters, draw a card.",
  power: "2",
  toughness: "3",
  loyalty: null,
  defense: null,
};
const oracleCard = {
  match_priority: 0,
  oracle_id: oracleId,
  scryfall_id: printingId,
  name: "Front Face // Back Face",
  layout: "transform",
  type_line: "Creature — Test // Creature — Test",
  oracle_text: null,
  mana_cost: null,
  keywords: ["Flying"],
  faces: [face, { ...face, faceIndex: 1, name: "Back Face", manaCost: null, oracleText: "Vigilance" }],
  source_url: `https://scryfall.com/card/test/1?oracle=${oracleId}`,
};
const paragraphs = [
  { face_index: 0, effect_index: 0, text: "Flying" },
  { face_index: 0, effect_index: 1, text: "When this creature enters, draw a card." },
  { face_index: 1, effect_index: 0, text: "Vigilance" },
];

function fakeDatabase(overrides = {}) {
  const calls = [];
  const read = async (sql, values) => {
    calls.push({ sql, values });
    if (sql.includes("from app_rules_datasets")) {
      if (overrides.datasetError) throw overrides.datasetError;
      return { rows: overrides.datasets ?? [dataset] };
    }
    if (sql.includes("from app_card_effects e")) return { rows: overrides.search ?? [] };
    if (sql.includes("from app_oracle_cards c")) return { rows: overrides.cards ?? [oracleCard] };
    if (sql.includes("from app_card_effects")) return { rows: overrides.effects ?? paragraphs };
    if (sql.includes("from app_card_rulings")) return { rows: overrides.rulings ?? [] };
    throw new Error(`Unexpected read: ${sql}`);
  };
  return { calls, read, reader: createCardRulesReader(read) };
}

function routeFixture(overrides = {}) {
  const database = fakeDatabase(overrides);
  const fixture = {
    query: database.read,
    access: { kind: "anonymous", tier: "anonymous", scopes: [], limit: 60, remaining: 59 },
    accessError: null,
    authorizations: [],
  };
  globalThis[Symbol.for(routeFixtureKey)] = fixture;
  return { fixture, database };
}

function apiError(status, code) {
  return (error) => error instanceof ApiError && error.status === status && error.code === code;
}

test("card lookup requires one bounded exact identifier and rejects unknown parameters", () => {
  assert.deepEqual(parseCardRulesParameters(new URLSearchParams({ card: "  Front Face  " })), { card: "Front Face" });
  for (const params of [
    "", "card=+", "card=one&card=two", "card=one&q=two", "card=bad%00name",
    new URLSearchParams({ card: "a".repeat(201) }),
  ]) {
    assert.throws(() => parseCardRulesParameters(new URLSearchParams(params)), apiError(400, "invalid_parameter"));
  }
  assert.equal(parseCardRulesParameters(new URLSearchParams({ card: "a".repeat(200) })).card.length, 200);
});

test("effect search validates text, pagination bounds, repeated parameters, and unknown keys", () => {
  assert.deepEqual(parseCardEffectsParameters(new URLSearchParams({ q: "  draw cards  " })), {
    query: "draw cards", limit: 20, cursor: null,
  });
  assert.equal(parseCardEffectsParameters(new URLSearchParams("q=draw&limit=50")).limit, 50);
  for (const params of [
    "", "q=x", "q=+", "q=bad%00query", "q=draw&offset=2", "q=draw&limit=51", "q=draw&limit=0",
    "q=draw&limit=1.2", "q=draw&limit=-1", "q=draw&limit=", "q=draw&limit=Infinity",
    "q=draw&q=damage", "q=draw&limit=1&limit=2", "q=draw&cursor=one&cursor=two",
    new URLSearchParams({ q: "a".repeat(201) }),
  ]) {
    assert.throws(() => parseCardEffectsParameters(new URLSearchParams(params)), apiError(400, "invalid_parameter"));
  }
});

const cursorPayload = {
  datasetId, q: "draw cards", oracleId, faceIndex: "0", effectIndex: "1",
};

test("effect cursors reject malformed, oversized, cross-query, and unsafe SQL values", () => {
  const valid = encodeCursor(cursorPayload);
  const parsed = parseCardEffectsParameters(new URLSearchParams({ q: "draw cards", cursor: valid }));
  assert.equal(parsed.cursor.datasetId, datasetId);
  for (const cursor of [
    "", "not-a-cursor", valid + "=", "a".repeat(2049),
    Buffer.from("null").toString("base64url"),
    Buffer.from("[]").toString("base64url"),
    encodeCursor({ ...cursorPayload, q: "other query" }),
    encodeCursor({ ...cursorPayload, datasetId: "1); drop table cards;--" }),
    encodeCursor({ ...cursorPayload, oracleId: "not-a-uuid" }),
    encodeCursor({ ...cursorPayload, faceIndex: "-1" }),
    encodeCursor({ ...cursorPayload, faceIndex: "2147483648" }),
    encodeCursor({ ...cursorPayload, effectIndex: "1e3" }),
    encodeCursor({ ...cursorPayload, effectIndex: "01" }),
    encodeCursor({ ...cursorPayload, extra: "unrecognized" }),
  ]) {
    assert.throws(
      () => parseCardEffectsParameters(new URLSearchParams({ q: "draw cards", cursor })),
      apiError(400, "invalid_cursor"),
    );
  }
});

test("exact lookup preserves multi-face nulls, text, effect order, and source provenance", async () => {
  const { reader, calls } = fakeDatabase();
  const result = await reader.getCardRules("Front Face");
  assert.deepEqual(result.card, {
    oracleId, scryfallId: printingId, name: oracleCard.name, layout: "transform",
    typeLine: oracleCard.type_line, oracleText: null, manaCost: null, keywords: ["Flying"],
    faces: oracleCard.faces, sourceUrl: oracleCard.source_url,
    effects: paragraphs.map((row) => ({ faceIndex: row.face_index, effectIndex: row.effect_index, text: row.text })),
    rulings: [], rulingsTruncated: false,
  });
  assert.deepEqual(result.source, {
    datasetId, importedAt: "2026-09-19T12:01:00.000Z", oracle: dataset.oracle_source,
    rulings: dataset.rulings_source, cardCount: 3, effectCount: 4, rulingCount: 51,
  });
  assert.match(calls[0].sql, /is_active = true/);
  const lookup = calls[1];
  assert.deepEqual(lookup.values, [datasetId, "Front Face"]);
  assert.match(lookup.sql, /jsonb_array_elements\(c.faces\)/);
  assert.match(lookup.sql, /lower\(face->>'name'\) = lower\(\$2\)/);
  assert.doesNotMatch(lookup.sql, /ilike|similarity|\$2::uuid/);
  for (const call of calls.slice(2)) assert.deepEqual(call.values, [datasetId, oracleId]);
});

test("printing and Oracle UUID lookup resolves only within the chosen dataset", async () => {
  const { reader, calls } = fakeDatabase();
  await reader.getCardRules(printingId);
  const lookup = calls[1];
  assert.deepEqual(lookup.values, [datasetId, printingId]);
  assert.match(lookup.sql, /c.dataset_id = \$1::uuid/);
  assert.match(lookup.sql, /c.oracle_id = \$2::uuid/);
  assert.match(lookup.sql, /c.scryfall_id = \$2::uuid/);
  assert.match(lookup.sql, /select p.oracle_id from cards p where p.scryfall_id = \$2::uuid/);
  assert.match(lookup.sql, /0 as match_priority/);
  assert.doesNotMatch(lookup.sql, /case when/);
});

test("an exact full name takes precedence over art-series face matches", async () => {
  const playable = { ...oracleCard, name: "Blood Artist", layout: "normal", match_priority: 0 };
  const art = { ...oracleCard, oracle_id: secondOracleId, name: "Blood Artist // Blood Artist", layout: "art_series", match_priority: 1 };
  const { reader, calls } = fakeDatabase({ cards: [playable, art] });
  const { card } = await reader.getCardRules("Blood Artist");
  assert.equal(card.name, "Blood Artist");
  assert.equal(card.oracleId, oracleId);
  assert.match(calls[1].sql, /case when lower\(c.name\) = lower\(\$2\) then 0 else 1 end as match_priority/);
  assert.match(calls[1].sql, /order by match_priority, lower\(c.name\), c.oracle_id/);
  assert.equal(calls.filter((call) => call.sql.includes("from app_oracle_cards c")).length, 1);
  assert.equal("match_priority" in card, false);
});

test("duplicate full names stay ambiguous and exclude fallback face candidates", async () => {
  const cards = [
    { ...oracleCard, name: "Shared Name", match_priority: 0 },
    { ...oracleCard, oracle_id: secondOracleId, name: "Shared Name", match_priority: 0 },
    { ...oracleCard, name: "Shared Name // Other Face", match_priority: 1 },
  ];
  const { reader } = fakeDatabase({ cards });
  await assert.rejects(reader.getCardRules("Shared Name"), (error) => {
    assert.ok(apiError(409, "ambiguous_card")(error));
    assert.deepEqual(error.details.candidates, [
      { oracleId, name: "Shared Name" },
      { oracleId: secondOracleId, name: "Shared Name" },
    ]);
    assert.equal(error.details.candidatesTruncated, false);
    return true;
  });
});

test("face-only lookup falls back to a parent card or returns ambiguous parent IDs", async () => {
  const parent = { ...oracleCard, match_priority: 1 };
  const single = fakeDatabase({ cards: [parent] });
  assert.equal((await single.reader.getCardRules("Front Face")).card.name, oracleCard.name);
  const multiple = fakeDatabase({ cards: [parent, { ...parent, oracle_id: secondOracleId, name: "Other // Front Face" }] });
  await assert.rejects(multiple.reader.getCardRules("Front Face"), (error) => {
    assert.ok(apiError(409, "ambiguous_card")(error));
    assert.deepEqual(error.details.candidates.map((candidate) => candidate.oracleId), [oracleId, secondOracleId]);
    return true;
  });
});

test("UUID matches keep equal priority across Oracle, representative, and known printing identities", async () => {
  for (const identifier of [oracleId, printingId]) {
    const unique = fakeDatabase();
    assert.equal((await unique.reader.getCardRules(identifier)).card.oracleId, oracleId);
    assert.match(unique.calls[1].sql, /0 as match_priority/);
    assert.deepEqual(unique.calls[1].values, [datasetId, identifier]);
  }
  const collision = fakeDatabase({ cards: [
    { ...oracleCard, name: printingId, match_priority: 0 },
    { ...oracleCard, oracle_id: secondOracleId, name: "Card matched by printing identity", match_priority: 0 },
  ] });
  await assert.rejects(collision.reader.getCardRules(printingId), (error) => {
    assert.ok(apiError(409, "ambiguous_card")(error));
    assert.equal(error.details.candidates.length, 2);
    return true;
  });
});

test("names remain bound data and cannot modify the lookup SQL", async () => {
  const { reader, calls } = fakeDatabase({ cards: [] });
  const name = "Teferi'); drop table cards; --";
  await assert.rejects(reader.getCardRules(name), apiError(404, "card_not_found"));
  assert.equal(calls[1].values[1], name);
  assert.doesNotMatch(calls[1].sql, /drop table/);
  assert.equal(calls.length, 2);
});

test("ambiguous face names return bounded candidates instead of guessing", async () => {
  const cards = Array.from({ length: 11 }, (_, i) => ({ ...oracleCard, name: `Card ${i}`, oracle_id: String(i) }));
  const { reader, calls } = fakeDatabase({ cards });
  await assert.rejects(reader.getCardRules("Shared Face"), (error) => {
    assert.ok(apiError(409, "ambiguous_card")(error));
    assert.equal(error.details.candidates.length, 10);
    assert.deepEqual(error.details.candidates[0], { oracleId: "0", name: "Card 0" });
    assert.equal(error.details.candidatesTruncated, true);
    return true;
  });
  assert.match(calls[1].sql, /limit 11/);
  assert.equal(calls.length, 2);
});

test("card rulings are bounded with explicit truncation and preserved publication dates", async () => {
  const rulings = Array.from({ length: 51 }, (_, i) => ({ source: "wotc", published_at: "2026-09-19", comment: `Ruling ${i}` }));
  const { reader, calls } = fakeDatabase({ rulings });
  const { card } = await reader.getCardRules(oracleId);
  assert.equal(card.rulings.length, 50);
  assert.equal(card.rulingsTruncated, true);
  assert.deepEqual(card.rulings[0], { source: "wotc", publishedAt: "2026-09-19", comment: "Ruling 0" });
  assert.match(calls.find((call) => call.sql.includes("from app_card_rulings")).sql, /order by published_at desc, ruling_index\s+limit 51/);
  const exactLimit = fakeDatabase({ rulings: rulings.slice(0, 50) });
  assert.equal((await exactLimit.reader.getCardRules(oracleId)).card.rulingsTruncated, false);
});

test("missing import and missing migration return an actionable 503", async () => {
  for (const overrides of [{ datasets: [] }, { datasetError: { code: "42P01" } }]) {
    const { reader } = fakeDatabase(overrides);
    await assert.rejects(reader.getCardRules("Lightning Bolt"), (error) => {
      assert.ok(apiError(503, "card_rules_unavailable")(error));
      assert.match(error.message, /migrations.*db:sync-card-rules/);
      return true;
    });
    await assert.rejects(reader.searchCardEffects(parseCardEffectsParameters(new URLSearchParams("q=damage"))), apiError(503, "card_rules_unavailable"));
  }
});

test("unexpected database failures are not mislabeled as a missing dataset", async () => {
  const error = Object.assign(new Error("connection failure"), { code: "08006" });
  const { reader } = fakeDatabase({ datasetError: error });
  await assert.rejects(reader.getCardRules("Lightning Bolt"), (caught) => caught === error);
});

test("search pages are bounded, parameterized, and pinned to a stable dataset", async () => {
  const rows = [
    { ...paragraphs[1], oracle_id: oracleId, name: oracleCard.name, source_url: oracleCard.source_url },
    { ...paragraphs[1], oracle_id: secondOracleId, name: "Other Card", source_url: "https://scryfall.com/card/test/2" },
  ];
  const first = fakeDatabase({ search: rows });
  const result = await first.reader.searchCardEffects(parseCardEffectsParameters(new URLSearchParams("q=draw+cards&limit=1")));
  assert.deepEqual(result.data.results, [{
    oracleId, name: oracleCard.name, faceIndex: 0, effectIndex: 1,
    text: paragraphs[1].text, sourceUrl: oracleCard.source_url,
  }]);
  assert.equal(result.pagination.limit, 1);
  assert.ok(result.pagination.nextCursor);
  assert.deepEqual(first.calls[1].values, [datasetId, "draw cards", 2]);
  assert.match(first.calls[1].sql, /plainto_tsquery\('english', \$2\)/);
  assert.match(first.calls[1].sql, /order by e.oracle_id, e.face_index, e.effect_index/);
  const continuation = parseCardEffectsParameters(new URLSearchParams({ q: "draw cards", limit: "1", cursor: result.pagination.nextCursor }));
  const second = fakeDatabase({ search: rows.slice(1) });
  const next = await second.reader.searchCardEffects(continuation);
  assert.deepEqual(second.calls[0].values, [datasetId]);
  assert.match(second.calls[0].sql, /where id = \$1::uuid/);
  assert.doesNotMatch(second.calls[0].sql, /is_active/);
  assert.deepEqual(second.calls[1].values, [datasetId, "draw cards", oracleId, 0, 1, 2]);
  assert.match(second.calls[1].sql, /\(e.oracle_id, e.face_index, e.effect_index\) > \(\$3::uuid, \$4::integer, \$5::integer\)/);
  assert.equal(next.pagination.nextCursor, null);
  assert.equal(next.data.results[0].oracleId, secondOracleId);
  assert.equal(next.data.source.datasetId, result.data.source.datasetId);
});

test("empty results still identify the dataset and removed snapshots require restarting", async () => {
  const empty = fakeDatabase();
  const result = await empty.reader.searchCardEffects(parseCardEffectsParameters(new URLSearchParams("q=unmatched")));
  assert.deepEqual(result.data.results, []);
  assert.equal(result.data.source.datasetId, datasetId);
  assert.equal(result.pagination.nextCursor, null);
  const removed = fakeDatabase({ datasets: [] });
  const options = parseCardEffectsParameters(new URLSearchParams({ q: "draw cards", cursor: encodeCursor(cursorPayload) }));
  await assert.rejects(removed.reader.searchCardEffects(options), apiError(400, "invalid_cursor"));
  assert.equal(removed.calls.length, 1);
});

test("OpenAPI exposes exact rules, effects, source, and pagination contracts", () => {
  const rules = publicApiOpenApi.paths["/card-rules"].get;
  assert.equal(rules.parameters[0].required, true);
  assert.deepEqual(rules.parameters[0].schema, { type: "string", minLength: 1, maxLength: 200 });
  assert.ok(rules.responses["404"] && rules.responses["409"] && rules.responses["503"]);
  const effects = publicApiOpenApi.paths["/card-effects"].get;
  assert.deepEqual(effects.parameters.find((parameter) => parameter.name === "limit").schema, { type: "integer", minimum: 1, maximum: 50, default: 20 });
  const schemas = publicApiOpenApi.components.schemas;
  assert.deepEqual(schemas.OracleCard.properties.oracleText.type, ["string", "null"]);
  assert.equal(schemas.OracleCard.properties.rulings.maxItems, 50);
  assert.ok(schemas.OracleCard.required.includes("rulingsTruncated"));
  assert.deepEqual(schemas.CardRulesSource.required, ["datasetId", "importedAt", "oracle", "rulings", "cardCount", "effectCount", "rulingCount"]);
  assert.deepEqual(schemas.CardEffectsResponse.properties.data.required, ["results", "source"]);
  assert.ok(schemas.CardEffectsResponse.properties.meta.required.includes("pagination"));
});

test("card rules HTTP route uses shared authorization, caching, and provenance envelopes", async () => {
  const { fixture, database } = routeFixture();
  const request = new NextRequest("https://magic-brain.example/api/v1/card-rules?card=Front%20Face", {
    headers: { "x-request-id": "card-rules-request" },
  });
  const response = await cardRulesRoute.GET(request);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.data.card.oracleId, oracleId);
  assert.deepEqual(body.data.source.oracle, descriptor);
  assert.equal(body.data.source.importedAt, "2026-09-19T12:01:00.000Z");
  assert.deepEqual(body.meta, {
    requestId: "card-rules-request", access: { type: "anonymous", tier: "anonymous" },
  });
  assert.equal(response.headers.get("cache-control"), "public, s-maxage=300, stale-while-revalidate=900");
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  assert.equal(response.headers.get("ratelimit-limit"), "60");
  assert.equal(response.headers.get("ratelimit-remaining"), "59");
  assert.deepEqual(fixture.authorizations, [{ request, policy: {} }]);
  assert.equal(database.calls.length, 4);
});

test("effect search HTTP route keeps pagination under meta and supports keyed access", async () => {
  const search = [oracleId, secondOracleId].map((id) => ({
    ...paragraphs[1], oracle_id: id, name: oracleCard.name, source_url: oracleCard.source_url,
  }));
  const { fixture } = routeFixture({ search });
  fixture.access = { kind: "key", tier: "developer", scopes: ["data:read"], limit: 600, remaining: 598 };
  const response = await cardEffectsRoute.GET(new NextRequest("https://magic-brain.example/api/v1/card-effects?q=draw%20cards&limit=1"));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.data.results.length, 1);
  assert.equal(body.data.source.datasetId, datasetId);
  assert.deepEqual(body.meta.access, { type: "key", tier: "developer" });
  assert.equal("pagination" in body.data, false);
  assert.equal(body.meta.pagination.limit, 1);
  const continuation = parseCardEffectsParameters(new URLSearchParams({
    q: "draw cards", cursor: body.meta.pagination.nextCursor,
  }));
  assert.equal(continuation.cursor.datasetId, datasetId);
  assert.equal(continuation.cursor.oracleId, oracleId);
  assert.equal(response.headers.get("ratelimit-limit"), "600");
});

test("card routes reject authorization and rate-limit failures before querying with uncached error envelopes", async () => {
  for (const route of [cardRulesRoute, cardEffectsRoute]) {
    for (const error of [
      new ApiError(401, "invalid_api_key", "The API key is invalid"),
      new ApiError(403, "insufficient_scope", "Required scope missing", { requiredScopes: ["data:read"] }),
      new ApiError(429, "rate_limit_exceeded", "Rate limit exceeded", { retryAfter: 17 }),
      new ApiError(503, "rate_limit_unavailable", "API rate limiting is temporarily unavailable"),
    ]) {
      const { fixture, database } = routeFixture();
      fixture.accessError = error;
      const response = await route.GET(new NextRequest("https://magic-brain.example/api/v1/card-rules?card=Front%20Face&q=draw"));
      const body = await response.json();
      assert.equal(response.status, error.status);
      assert.equal(body.error.code, error.code);
      assert.ok(body.meta.requestId);
      assert.equal("data" in body, false);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(database.calls.length, 0);
      if (error.status === 429) assert.equal(response.headers.get("retry-after"), "17");
      if ([401, 403].includes(error.status)) {
        assert.match(response.headers.get("www-authenticate"), /oauth-protected-resource\/api\/v1/);
      }
    }
  }
});

test("card routes return validation and unavailable-dataset errors without caching failures", async () => {
  const invalid = routeFixture();
  const validationResponse = await cardEffectsRoute.GET(new NextRequest("https://magic-brain.example/api/v1/card-effects?q=draw&limit=51"));
  assert.equal(validationResponse.status, 400);
  assert.equal((await validationResponse.json()).error.code, "invalid_parameter");
  assert.equal(validationResponse.headers.get("cache-control"), "no-store");
  assert.equal(invalid.database.calls.length, 0);

  routeFixture({ datasets: [] });
  const missingResponse = await cardRulesRoute.GET(new NextRequest("https://magic-brain.example/api/v1/card-rules?card=Front%20Face"));
  assert.equal(missingResponse.status, 503);
  assert.equal((await missingResponse.json()).error.code, "card_rules_unavailable");
  assert.equal(missingResponse.headers.get("cache-control"), "no-store");
});
