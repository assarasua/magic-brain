import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { transformCardRules } from "../scripts/card-rules/transform.mjs";
import { importCardRules } from "../scripts/card-rules/database.mjs";
import { bulkDescriptor, downloadBulk, loadLocalBulk, readBulkRecords } from "../scripts/card-rules/source.mjs";

const oracleId = "11111111-1111-4111-8111-111111111111";
const printingId = "22222222-2222-4222-8222-222222222222";
const otherOracleId = "33333333-3333-4333-8333-333333333333";
const timestamp = "2026-09-19T09:00:00.000Z";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function card(overrides = {}) {
  return {
    id: printingId, oracle_id: oracleId, name: "Test permanent", layout: "normal",
    type_line: "Creature — Test", mana_cost: "{2}{U}", keywords: ["Flying"],
    oracle_text: "Flying\nWhen this creature enters, draw a card.", power: "2", toughness: "3",
    scryfall_uri: `https://scryfall.com/card/test/1/test-permanent`,
    ...overrides,
  };
}

function ruling(overrides = {}) {
  return { oracle_id: oracleId, source: "wotc", published_at: "2026-09-01", comment: "This is a test ruling.", ...overrides };
}

function source(bytes, suffix) {
  return { provider: "Scryfall", url: `https://data.scryfall.io/${suffix}`, updatedAt: timestamp, fetchedAt: timestamp, sha256: sha256(bytes) };
}

test("imports verbatim text, ordered paragraphs, and a synthetic face for a single-faced card", () => {
  const oracleText = "  Flying  \n\nWhen this creature enters, draw a card.\n";
  const result = transformCardRules([card({ oracle_text: oracleText })], []);
  assert.equal(result.cards[0].oracleText, oracleText);
  assert.equal(result.cards[0].faces[0].oracleText, oracleText);
  assert.equal(result.cards[0].faces[0].defense, null);
  assert.deepEqual(result.effects.map(({ effectIndex, text }) => ({ effectIndex, text })), [
    { effectIndex: 0, text: "  Flying  " },
    { effectIndex: 1, text: "When this creature enters, draw a card." },
  ]);
  assert.match(result.cards[0].searchText, /Creature — Test/);
});

test("preserves transform and Adventure faces without assigning the spell face to the permanent", () => {
  for (const layout of ["transform", "adventure"]) {
    const result = transformCardRules([card({
      layout, name: "Front // Back", oracle_text: undefined, mana_cost: undefined,
      card_faces: [
        { name: "Front", type_line: "Creature", mana_cost: "{1}{G}", oracle_text: "Vigilance", power: "2", toughness: "2" },
        { name: "Back", type_line: "Sorcery — Adventure", mana_cost: "{G}", oracle_text: "Draw a card.\nThen discard a card." },
      ],
    })], []);
    assert.equal(result.cards[0].oracleText, null);
    assert.deepEqual(result.cards[0].faces.map((face) => [face.faceIndex, face.name]), [[0, "Front"], [1, "Back"]]);
    assert.deepEqual(result.effects.map((effect) => [effect.faceIndex, effect.effectIndex]), [[0, 0], [1, 0], [1, 1]]);
    assert.match(result.cards[0].searchText, /Sorcery — Adventure/);
  }
});

test("keeps cards without text and preserves empty mana costs", () => {
  const result = transformCardRules([card({ oracle_text: "", mana_cost: "", keywords: [], type_line: "Land" })], []);
  assert.equal(result.cards.length, 1);
  assert.equal(result.cards[0].manaCost, "");
  assert.equal(result.cards[0].faces[0].manaCost, "");
  assert.equal(result.cards[0].oracleText, "");
  assert.deepEqual(result.effects, []);
  assert.equal(transformCardRules([card({ oracle_text: undefined })], []).cards[0].oracleText, null);
  assert.equal(transformCardRules([card()], [ruling({ comment: "" })]).rulings[0].comment, "");
});

test("deduplicates identical Oracle printings and exact rulings, preserving source distinctions", () => {
  const result = transformCardRules([
    card({ id: "ffffffff-ffff-4fff-8fff-ffffffffffff" }), card(),
  ], [ruling(), ruling(), ruling({ source: "scryfall" }), ruling({ oracle_id: otherOracleId })]);
  assert.equal(result.cards[0].scryfallId, printingId);
  assert.deepEqual(result.counts, { cards: 1, effects: 2, rulings: 2, duplicateCards: 1, duplicateRulings: 1, unmatchedRulings: 1 });
  assert.deepEqual(result.rulings.map(({ source, rulingIndex }) => [source, rulingIndex]), [["scryfall", 0], ["wotc", 1]]);
  assert.throws(() => transformCardRules([card(), card({ oracle_text: "Different current rules text" })], []), /Conflicting Oracle/);
});

test("rejects malformed identities, dates, faces, sources, and non-array datasets", () => {
  assert.throws(() => transformCardRules({}, []), /must be an array/);
  assert.throws(() => transformCardRules([], []), /must be an array/);
  assert.throws(() => transformCardRules([card({ oracle_id: "not-a-uuid" })], []), /UUID/);
  assert.throws(() => transformCardRules([card({ card_faces: [] })], []), /1–10/);
  assert.throws(() => transformCardRules([card({ oracle_text: 123 })], []), /must be a string/);
  assert.throws(() => transformCardRules([card({ oracle_text: "NUL\u0000byte" })], []), /NUL/);
  assert.throws(() => transformCardRules([card({ scryfall_uri: "https://example.test/card" })], []), /official Scryfall/);
  assert.throws(() => transformCardRules([card()], [ruling({ published_at: "2026-02-30" })]), /valid YYYY-MM-DD/);
  assert.throws(() => transformCardRules([card()], [ruling({ source: "community" })]), /wotc or scryfall/);
});

test("loads bounded gzipped JSONL and verifies original compressed checksums for local imports", async () => {
  const directory = await mkdtemp(join(tmpdir(), "magic-card-rules-"));
  try {
    const oracle = gzipSync(`${JSON.stringify(card())}\n`);
    const rulings = gzipSync(`${JSON.stringify(ruling())}\n`);
    const oracleFile = join(directory, "oracle.jsonl.gz");
    const rulingsFile = join(directory, "rulings.jsonl.gz");
    const metadataFile = join(directory, "sources.json");
    const metadata = { oracle_cards: { ...source(oracle, "oracle.jsonl.gz"), format: "jsonl.gz" }, rulings: { ...source(rulings, "rulings.jsonl.gz"), format: "jsonl.gz" } };
    await Promise.all([writeFile(oracleFile, oracle), writeFile(rulingsFile, rulings), writeFile(metadataFile, JSON.stringify(metadata))]);
    const loaded = await loadLocalBulk({ oracleFile, rulingsFile, metadataFile });
    assert.equal(loaded.oracleRecords[0].oracle_text, card().oracle_text);
    assert.equal(loaded.sources.oracle.sha256, sha256(oracle));
    assert.equal(loaded.sources.oracle.checksumScope, "downloaded-bytes");
    await assert.rejects(readBulkRecords(oracleFile, { maximumRecords: 1, format: "json" }), /compression/);
    await writeFile(oracleFile, gzipSync(`${JSON.stringify(card())}\n${JSON.stringify(card())}\n`));
    await assert.rejects(readBulkRecords(oracleFile, { maximumRecords: 1 }), /record limit/);
    await assert.rejects(loadLocalBulk({ oracleFile, rulingsFile, metadataFile }), /checksum/);
    const legacyFile = join(directory, "legacy.json");
    await writeFile(legacyFile, JSON.stringify([card()]));
    assert.equal((await readBulkRecords(legacyFile, { maximumRecords: 1 })).length, 1);
    await writeFile(legacyFile, "{}");
    await assert.rejects(readBulkRecords(legacyFile, { maximumRecords: 1 }), /must be an array/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("discovers current JSONL bulk format, spaces requests, and retains downloaded-byte provenance", async () => {
  const directory = await mkdtemp(join(tmpdir(), "magic-card-download-"));
  const oracle = gzipSync(`${JSON.stringify(card())}\n`);
  const rulings = gzipSync(`${JSON.stringify(ruling())}\n`);
  const metadata = { data: [
    { type: "oracle_cards", updated_at: timestamp, jsonl_download_uri: "https://data.scryfall.io/oracle-cards/test.jsonl.gz", compressed_size: oracle.length },
    { type: "rulings", updated_at: timestamp, jsonl_download_uri: "https://data.scryfall.io/rulings/test.jsonl.gz", compressed_size: rulings.length },
  ] };
  const times = [];
  try {
    const loaded = await downloadBulk({ cacheDirectory: directory, fetchImpl: async (url, init) => {
      times.push(Date.now());
      assert.match(new Headers(init.headers).get("user-agent"), /MagicBrain/);
      assert.match(new Headers(init.headers).get("accept"), /application\/json/);
      assert.equal(init.redirect, "error");
      const body = url.endsWith("bulk-data") ? JSON.stringify(metadata) : url.includes("oracle-cards") ? oracle : rulings;
      return new Response(body, { headers: { "content-length": String(Buffer.byteLength(body)) } });
    } });
    assert.equal(loaded.oracleRecords.length, 1);
    assert.equal(loaded.rulingRecords.length, 1);
    assert.equal(loaded.sources.oracle.sha256, sha256(oracle));
    assert.deepEqual(await readFile(loaded.files.oracleFile), oracle);
    assert.ok(times[1] - times[0] >= 100);
    assert.ok(times[2] - times[1] >= 100);
    assert.throws(() => bulkDescriptor({ data: [{ ...metadata.data[0], jsonl_download_uri: "https://example.test/cards.gz" }] }, "oracle_cards"), /official Scryfall/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("stages bounded parameterized batches and activates only after all content succeeds", async () => {
  const base = transformCardRules([card({ oracle_text: "Text with 'quotes'; DROP TABLE cards;" })], [ruling()]);
  const dataset = { ...base, cards: Array.from({ length: 501 }, () => base.cards[0]) };
  const calls = [];
  const client = { query: async (sql, values) => { calls.push({ sql, values }); return { rows: [] }; } };
  await importCardRules(client, dataset, { oracle: source("oracle", "oracle.json"), rulings: source("rulings", "rulings.json") }, { datasetId: otherOracleId });
  const cardBatches = calls.filter(({ sql }) => sql.includes("insert into app_oracle_cards"));
  assert.deepEqual(cardBatches.map(({ values }) => JSON.parse(values[1]).length), [500, 1]);
  assert.ok(cardBatches.every(({ sql }) => !sql.includes("DROP TABLE")));
  assert.match(cardBatches[0].values[1], /DROP TABLE/);
  assert.ok(calls.findIndex(({ sql }) => sql.includes("pg_advisory_xact_lock")) < calls.findIndex(({ sql }) => sql.includes("insert into app_rules_datasets")));
  assert.ok(calls.findIndex(({ sql }) => sql.includes("insert into app_card_rulings")) < calls.findIndex(({ sql }) => sql.includes("set is_active = false")));
  assert.equal(calls.at(-1).sql, "commit");
});

test("rolls back failed staging and failed activation so the previous dataset stays active", async () => {
  for (const failure of ["insert into app_card_effects", "set is_active = true"]) {
    let activeDataset = "previous";
    let transactionalActive;
    const calls = [];
    const client = { query: async (sql) => {
      calls.push(sql);
      if (sql === "begin") transactionalActive = activeDataset;
      if (sql.includes(failure)) throw new Error("Simulated database failure");
      if (sql.includes("set is_active = false")) transactionalActive = null;
      if (sql.includes("set is_active = true")) transactionalActive = "new";
      if (sql === "commit") activeDataset = transactionalActive;
      return { rows: [] };
    } };
    await assert.rejects(importCardRules(client, transformCardRules([card()], [ruling()]), {
      oracle: source("oracle", "oracle.json"), rulings: source("rulings", "rulings.json"),
    }), /Simulated database failure/);
    assert.equal(activeDataset, "previous");
    assert.equal(calls.at(-1), "rollback");
    assert.ok(!calls.includes("commit"));
  }
});
