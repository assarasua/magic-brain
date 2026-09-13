import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport, McpServer } from "@modelcontextprotocol/server";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { buildRulesIndex, searchRules } from "../src/rules/index.js";
import { RulesKnowledgeBase } from "../src/rules/knowledge-base.js";
import { parseRulesSource } from "../src/rules/parser.js";
import { registerRulesTools } from "../src/rules/tools.js";
import type {
  ExtractedRulesSource,
  RulesIndex,
} from "../src/rules/types.js";

let fixture: ExtractedRulesSource;
let index: RulesIndex;
const temporaryDirectories: string[] = [];

beforeAll(async () => {
  fixture = JSON.parse(
    await readFile(
      new URL("./fixtures/rules-pages.json", import.meta.url),
      "utf8",
    ),
  ) as ExtractedRulesSource;
  index = buildRulesIndex(fixture.source, parseRulesSource(fixture));
});

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) =>
      rm(path, { recursive: true, force: true }),
    ),
  );
});

describe("Comprehensive Rules parser", () => {
  it("parses numbered rules, sections, continuations, and glossary entries", () => {
    expect(index.documents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "rule:100.1",
          ruleNumber: "100.1",
          section: "100. General",
          page: 6,
        }),
        expect.objectContaining({
          id: "rule:100.2",
          text: expect.stringContaining("continuation belongs"),
          page: 7,
        }),
        expect.objectContaining({
          id: "glossary:active-player",
          glossaryTerm: "Active Player",
          page: 256,
        }),
      ]),
    );
  });
});

describe("deterministic lexical rules search", () => {
  it("prioritizes an exact rule reference and returns bounded citations", () => {
    const first = searchRules(index, "What does rule 100.1 say?", {
      limit: 2,
      maxExcerptChars: 80,
    });
    const second = searchRules(index, "What does rule 100.1 say?", {
      limit: 2,
      maxExcerptChars: 80,
    });

    expect(second).toEqual(first);
    expect(first[0]).toMatchObject({
      citation: {
        ruleNumber: "100.1",
        section: "100. General",
        page: 6,
        sourceUrl: fixture.source.sourceUrl,
      },
    });
    expect(first[0]!.excerpt.length).toBeLessThanOrEqual(82);
  });

  it("can include or exclude glossary matches", () => {
    expect(
      searchRules(index, "active player turn", { kinds: ["glossary"] })[0]
        ?.citation.glossaryTerm,
    ).toBe("Active Player");
    expect(
      searchRules(index, "active player turn", { kinds: ["rule"] }).every(
        ({ citation }) => !citation.glossaryTerm,
      ),
    ).toBe(true);
  });
});

describe("rules-question result", () => {
  it("separates official excerpts from non-authoritative synthesis", async () => {
    const directory = await mkdtemp(join(tmpdir(), "magic-rules-test-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "rules-index.json");
    await writeFile(path, JSON.stringify(index));
    const knowledge = new RulesKnowledgeBase({ indexPath: path });

    const result = await knowledge.ask({
      question: "Who is the active player?",
      limit: 2,
      maxExcerptChars: 120,
    });

    expect(result.officialRules[0]?.citation.sourceUrl).toBe(
      fixture.source.sourceUrl,
    );
    expect(result.explanatorySynthesis.authority).toBe("non-authoritative");
    expect(result.source).toMatchObject({
      matchesPinnedOfficialSource: true,
      sha256: fixture.source.sha256,
    });
  });

  it("fails clearly when the local-only index has not been built", async () => {
    const knowledge = new RulesKnowledgeBase({
      indexPath: join(tmpdir(), "definitely-missing-rules-index.json"),
      loadTimeoutMs: 100,
    });
    await expect(
      knowledge.search({ query: "flying" }),
    ).rejects.toThrow(/Run the documented/);
  });
});

describe("rules MCP tool contract", () => {
  it("publishes two bounded read-only tools and returns structured citations", async () => {
    const directory = await mkdtemp(join(tmpdir(), "magic-rules-mcp-test-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "rules-index.json");
    await writeFile(path, JSON.stringify(index));
    const server = new McpServer({ name: "rules-test", version: "1.0.0" });
    registerRulesTools(server, { indexPath: path });
    const client = new Client({ name: "test-client", version: "1.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    const { tools } = await client.listTools();
    expect(tools.map(({ name }) => name).sort()).toEqual([
      "ask_rules",
      "search_rules",
    ]);
    for (const tool of tools) {
      expect(tool.title).toBeTruthy();
      expect(tool.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      });
    }
    const result = await client.callTool({
      name: "ask_rules",
      arguments: {
        question: "Who is the active player?",
        limit: 1,
        max_excerpt_chars: 100,
      },
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      explanatorySynthesis: { authority: "non-authoritative" },
      officialRules: [
        {
          citation: {
            page: 256,
            sourceUrl: fixture.source.sourceUrl,
          },
        },
      ],
    });

    await client.close();
    await server.close();
  });
});
