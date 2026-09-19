import { readFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { MagicBrainMcpConfig } from "../src/config.js";
import { createMagicBrainMcpServer } from "../src/server.js";
import { buildRulesIndex } from "../src/rules/index.js";
import { parseRulesSource } from "../src/rules/parser.js";
import type { ExtractedRulesSource, RulesIndex } from "../src/rules/types.js";
import type { CardRules, CardSource } from "../src/cards/schemas.js";

const config: MagicBrainMcpConfig = {
  apiBaseUrl: new URL("https://example.test/api/v1/"),
  apiTimeoutMs: 1000,
  maxResponseBytes: 100_000,
  maxToolChars: 90_000,
  port: 8788,
  bindHost: "127.0.0.1",
  allowedHosts: ["localhost"],
  allowedOrigins: [],
  oauthIssuerUrl: new URL("https://auth.example.test"),
  oauthResourceUrl: new URL("https://mcp.example.test/mcp"),
  oauthIntrospectionUrl: new URL("https://auth.example.test/oauth/introspect"),
  allowPersonalApiKey: false,
};
const source: CardSource = {
  datasetId: "snapshot-2026-09-19",
  importedAt: "2026-09-19T10:00:00Z",
  oracle: {
    provider: "scryfall", url: "https://data.scryfall.io/oracle-cards/oracle-cards-test.json",
    updatedAt: "2026-09-19T08:00:00Z", fetchedAt: "2026-09-19T09:00:00Z", sha256: "a".repeat(64),
    format: "jsonl-gzip", checksumScope: "downloaded-bytes",
  },
  rulings: {
    provider: "scryfall", url: "https://data.scryfall.io/rulings/rulings-test.json",
    updatedAt: "2026-09-18T08:00:00Z", fetchedAt: "2026-09-19T09:00:00Z", sha256: "b".repeat(64),
  },
  cardCount: 1, effectCount: 2, rulingCount: 2,
};
const card: CardRules = {
  oracleId: "00000000-0000-4000-8000-000000000001",
  scryfallId: "00000000-0000-4000-8000-000000000002",
  name: "Delver of Secrets // Insectile Aberration",
  layout: "transform", typeLine: "Creature — Human Wizard // Creature — Human Insect",
  oracleText: null, manaCost: null, keywords: ["Flying"],
  faces: [
    { faceIndex: 0, name: "Delver of Secrets", typeLine: "Creature — Human Wizard", manaCost: "{U}",
      oracleText: "At the beginning of your upkeep, look at the top card of your library. You may reveal that card. If an instant or sorcery card is revealed this way, transform Delver of Secrets.",
      power: "1", toughness: "1", loyalty: null, defense: null },
    { faceIndex: 1, name: "Insectile Aberration", typeLine: "Creature — Human Insect", manaCost: "",
      oracleText: "Flying", power: "3", toughness: "2", loyalty: null, defense: null },
  ],
  sourceUrl: "https://scryfall.com/card/isd/51/delver-of-secrets-insectile-aberration",
  effects: [
    { faceIndex: 0, effectIndex: 0, text: "At the beginning of your upkeep, look at the top card of your library. You may reveal that card. If an instant or sorcery card is revealed this way, transform Delver of Secrets." },
    { faceIndex: 1, effectIndex: 0, text: "Flying" },
  ],
  rulings: [
    { source: "wotc", publishedAt: "2011-09-22", comment: "Test fixture for a dated Wizards ruling." },
    { source: "scryfall", publishedAt: "2026-09-18", comment: "Test fixture for separately labelled Scryfall commentary." },
  ],
  rulingsTruncated: false,
};

let index: RulesIndex;
const cleanups: Array<() => Promise<void>> = [];
beforeAll(async () => {
  const fixture = JSON.parse(await readFile(new URL("./fixtures/rules-pages.json", import.meta.url), "utf8")) as ExtractedRulesSource;
  index = buildRulesIndex(fixture.source, [...parseRulesSource(fixture), {
    id: "rule:702.9b", kind: "rule", ruleNumber: "702.9b", section: "702. Keyword Abilities", page: 147,
    text: "A creature with flying can’t be blocked except by creatures with flying and/or reach. A creature with flying can block a creature with or without flying.",
  }]);
});
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

async function connect(fetchImpl: typeof fetch, overrides: Partial<MagicBrainMcpConfig> = {}, missingRules = false) {
  const server = createMagicBrainMcpServer({ ...config, ...overrides }, fetchImpl,
    missingRules ? { indexPath: "/no-such-rules-index.json" } : { index });
  const client = new Client({ name: "card-rules-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  await client.listTools();
  cleanups.push(async () => { await client.close(); await server.close(); });
  return client;
}

function cardResponse(overrides: Partial<CardRules> = {}, snapshot = source) {
  return new Response(JSON.stringify({ data: { card: { ...card, ...overrides }, source: snapshot }, meta: {} }), {
    headers: { "x-request-id": "cards-request" },
  });
}

describe("card rules MCP evidence", () => {
  it("retrieves the exact identifier, all faces, source-labelled rulings and source checksums", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      expect(url.pathname).toBe("/api/v1/card-rules");
      expect(url.searchParams.get("card")).toBe("Delver of Secrets");
      return cardResponse();
    });
    const client = await connect(fetchImpl);
    const result = await client.callTool({ name: "get_card_rules", arguments: { card: "Delver of Secrets" } });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      card,
      source,
      attribution: { request_id: "cards-request" },
      interpretationNotice: expect.stringContaining("verbatim Oracle text paragraphs"),
      freshnessNotice: expect.stringContaining("has not checked current live"),
    });
  });

  it("forwards bounded effect search and preserves its opaque next-page cursor", async () => {
    const query = "飛".repeat(200);
    const cursor = "c".repeat(1300);
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      expect(url.pathname).toBe("/api/v1/card-effects");
      expect(Object.fromEntries(url.searchParams)).toEqual({ q: query, limit: "2", cursor });
      return Response.json({
        data: { results: [{ oracleId: card.oracleId, name: card.name, faceIndex: 1, effectIndex: 0, text: "Flying", sourceUrl: card.sourceUrl }], source },
        meta: { pagination: { limit: 2, nextCursor: "next-cursor" } },
      });
    });
    const client = await connect(fetchImpl);
    const result = await client.callTool({ name: "search_card_effects", arguments: { query, limit: 2, cursor } });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      results: [{ faceIndex: 1, effectIndex: 0, text: "Flying" }],
      source,
      pagination: { limit: 2, nextCursor: "next-cursor" },
    });
  });

  it("combines full card text, dated rulings and official citations without claiming a game outcome", async () => {
    const client = await connect(async () => cardResponse());
    const question = `${"Consider the described interaction carefully. ".repeat(35)}Who is the active player and how does flying restrict blocking?`;
    const state = { active_player: "Alice", phase: "declare blockers", stack: [], targets: [] };
    const result = await client.callTool({
      name: "explain_card_interaction",
      arguments: { cards: [card.name], question, game_state: state },
    });
    expect(result.isError).not.toBe(true);
    const output = result.structuredContent as Record<string, unknown>;
    expect(output).toMatchObject({
      question,
      evidenceStatus: "retrieved",
      cards: [{ requested: card.name, status: "found", card, source }],
      officialRules: expect.arrayContaining([{
        score: expect.any(Number), excerpt: expect.stringContaining("blocked"),
        citation: { ruleNumber: "702.9b", section: "702. Keyword Abilities", page: 147, sourceUrl: index.source.sourceUrl },
      }]),
      rules: { source: { effectiveDate: "2026-08-07", matchesPinnedOfficialSource: true } },
      gameState: { supplied: state, verified: false, provenance: "user-supplied, unverified" },
      interpretationAuthority: "non-authoritative",
      answerInstructions: expect.arrayContaining([expect.stringContaining("does not decide the game outcome")]),
    });
    const rules = output.rules as { retrieval: { queries: string[] }; source: { freshnessNotice: string } };
    expect(rules.retrieval.queries.join(" ")).toContain("Who is the active player and how does flying restrict blocking?");
    expect(rules.retrieval.queries.every((query) => query.length <= 300)).toBe(true);
    const citations = (output.officialRules as Array<{ citation: unknown }>).map(({ citation }) => JSON.stringify(citation));
    expect(new Set(citations).size).toBe(citations.length);
    expect(output.contextNeeded).not.toEqual(expect.arrayContaining([expect.objectContaining({ field: "active_player" })]));
    expect(output.contextNeeded).toEqual(expect.arrayContaining([expect.objectContaining({ field: "choices" })]));
    expect(rules.source.freshnessNotice).toContain("has not been checked against the current live rules");
  });

  it("retains found evidence and returns distinct missing, ambiguous and unavailable card statuses", async () => {
    const candidates = [
      { oracleId: card.oracleId, name: "Ambiguous" },
      { oracleId: "00000000-0000-4000-8000-000000000003", name: "Ambiguous" },
    ];
    const client = await connect(async (input) => {
      const requested = new URL(String(input)).searchParams.get("card");
      const status = requested === "Missing" ? 404 : requested === "Ambiguous" ? 409 : requested === "Unavailable" ? 503 : 200;
      return status === 200 ? cardResponse() : Response.json({ error: {
        message: "lookup failed",
        ...(status === 409 ? { code: "ambiguous_card", details: { candidates, candidatesTruncated: false } } : {}),
      } }, { status });
    });
    const result = await client.callTool({
      name: "explain_card_interaction",
      arguments: { cards: [card.name, "Missing", "Ambiguous", "Unavailable"], question: "How does flying work?" },
    });
    expect(result.structuredContent).toMatchObject({
      evidenceStatus: "partial",
      cards: [
        { status: "found", card },
        { requested: "Missing", status: "not_found", error: { status: 404 } },
        { requested: "Ambiguous", status: "ambiguous", error: {
          status: 409, message: expect.stringContaining("Oracle UUID"), upstream_code: "ambiguous_card",
          details: { candidates, candidatesTruncated: false },
        } },
        { requested: "Unavailable", status: "unavailable", error: { status: 503 } },
      ],
    });
    const missing = (result.structuredContent as { cards: Array<Record<string, unknown>> }).cards.slice(1);
    expect(missing.every((item) => !("card" in item))).toBe(true);
  });

  it("marks unavailable cards explicitly even if the question finds official rules", async () => {
    const client = await connect(async () => Response.json({ error: "missing" }, { status: 404 }));
    const result = await client.callTool({ name: "explain_card_interaction", arguments: { cards: ["Missing"], question: "How does flying work?" } });
    expect(result.structuredContent).toMatchObject({ evidenceStatus: "unavailable", cards: [{ status: "not_found" }] });
    expect(result.structuredContent).not.toHaveProperty("answer");
  });

  it("keeps card evidence and marks missing Comprehensive Rules explicitly", async () => {
    const client = await connect(async () => cardResponse(), {}, true);
    const result = await client.callTool({ name: "explain_card_interaction", arguments: { cards: [card.name], question: "How does flying work?" } });
    expect(result.structuredContent).toMatchObject({
      evidenceStatus: "partial", cards: [{ status: "found" }], officialRules: [],
      rules: { status: "unavailable", source: null, error: { code: "RULES_INDEX_UNAVAILABLE" } },
    });
  });

  it("reports truncated rulings as incomplete evidence", async () => {
    const client = await connect(async () => cardResponse({ rulingsTruncated: true }));
    const result = await client.callTool({ name: "explain_card_interaction", arguments: { cards: [card.name], question: "How does flying work?" } });
    expect(result.structuredContent).toMatchObject({ evidenceStatus: "partial", cards: [{ card: { rulingsTruncated: true } }] });
  });

  it("warns when concurrent card lookups cross a dataset update", async () => {
    let calls = 0;
    const client = await connect(async () => cardResponse({}, { ...source, datasetId: `snapshot-${++calls}` }));
    const result = await client.callTool({ name: "explain_card_interaction", arguments: { cards: [card.name, "Other card"], question: "How does flying work?" } });
    expect(result.structuredContent).toMatchObject({ evidenceStatus: "partial", freshnessNotices: expect.arrayContaining([expect.stringContaining("different dataset snapshots")]) });
  });

  it("rejects a malformed successful response without inventing missing Oracle text", async () => {
    const client = await connect(async () => Response.json({ data: { card: { name: "Invented" }, source } }));
    const result = await client.callTool({ name: "get_card_rules", arguments: { card: "Invented" } });
    expect(result.isError).toBe(true);
    expect(result.content).toEqual(expect.arrayContaining([expect.objectContaining({ text: expect.stringContaining("INVALID_RESPONSE") })]));
  });

  it("bounds the combined evidence without silently clipping card text", async () => {
    const largeCard = { oracleText: "Oracle text paragraph. ".repeat(180) };
    const client = await connect(async () => cardResponse(largeCard), { maxToolChars: 8192 });
    const result = await client.callTool({ name: "explain_card_interaction", arguments: { cards: [card.name, "Other card"], question: "How does flying work?" } });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
    expect(result.content).toEqual(expect.arrayContaining([expect.objectContaining({ text: expect.stringContaining("RESPONSE_TOO_LARGE") })]));
    expect(JSON.stringify(result.content).length).toBeLessThan(8192);
  });

  it("rejects too many cards, huge questions, excessive game state and invalid search limits before fetching", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => cardResponse());
    const client = await connect(fetchImpl);
    for (const args of [
      { cards: ["a", "b", "c", "d", "e", "f"], question: "What happens?" },
      { cards: ["a"], question: "x".repeat(2001) },
      { cards: ["a"], question: "What happens?", game_state: { stack: ["x".repeat(501)] } },
      { cards: ["a"], question: "What happens?", game_state: { stack: Array(20).fill("x".repeat(500)) } },
    ]) {
      const result = await client.callTool({ name: "explain_card_interaction", arguments: args });
      expect(result.isError).toBe(true);
    }
    const result = await client.callTool({ name: "search_card_effects", arguments: { query: "flying", limit: 51 } });
    expect(result.isError).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
