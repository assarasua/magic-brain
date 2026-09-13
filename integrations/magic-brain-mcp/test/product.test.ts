import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport, McpServer } from "@modelcontextprotocol/server";
import { describe, expect, it } from "vitest";
import {
  PRODUCT_FACTS,
  searchProductKnowledge,
} from "../src/product/knowledge.js";
import { registerProductKnowledgeTools } from "../src/product/tools.js";
import { PRODUCT_STATUSES } from "../src/product/types.js";

describe("deterministic product knowledge", () => {
  it("returns stable, bounded, status-labelled, source-cited evidence", () => {
    const first = searchProductKnowledge({
      query: "What is the moat and competitive advantage?",
      limit: 4,
    });
    const second = searchProductKnowledge({
      query: "What is the moat and competitive advantage?",
      limit: 4,
    });

    expect(second).toEqual(first);
    expect(first.results).toHaveLength(4);
    expect(first.results[0]?.topic).toBe("differentiation_and_moat");
    for (const result of first.results) {
      expect(PRODUCT_STATUSES).toContain(result.status);
      expect(result.citations.length).toBeGreaterThan(0);
      expect(result.citations.every(({ url }) => URL.canParse(url))).toBe(true);
    }
  });

  it("contains explicit unknowns for prohibited fabrication categories", () => {
    const unknownText = PRODUCT_FACTS
      .filter(({ status }) => status === "unknown_not_measured")
      .map(({ statement }) => statement.toLowerCase())
      .join(" ");

    for (const required of [
      "aum-equivalent",
      "conversion",
      "retention",
      "willingness-to-pay",
      "market-size",
      "user",
      "sla",
      "superiority",
    ]) {
      expect(unknownText).toContain(required);
    }
  });

  it("retrieves failed-signal and liquidity caveats without inventing outcomes", () => {
    const result = searchProductKnowledge({
      query: "failed high-confidence signals in thin manipulable markets",
      limit: 6,
    });

    expect(result.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "failed-signals-unknown" }),
        expect.objectContaining({ id: "liquidity-caveat" }),
        expect.objectContaining({ id: "confidence-meaning" }),
      ]),
    );
  });
});

describe("product knowledge MCP tools", () => {
  it("publishes three local read-only tools with structured evidence", async () => {
    const server = new McpServer({ name: "product-test", version: "1.0.0" });
    registerProductKnowledgeTools(server);
    const client = new Client({ name: "test-client", version: "1.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    const { tools } = await client.listTools();
    expect(tools.map(({ name }) => name).sort()).toEqual([
      "ask_product_question",
      "get_product_context",
      "search_product_knowledge",
    ]);
    for (const tool of tools) {
      expect(tool.description?.length).toBeGreaterThan(80);
      expect(tool.outputSchema).toBeTruthy();
      expect(tool.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      });
    }

    const result = await client.callTool({
      name: "ask_product_question",
      arguments: {
        question: "What are monetization and willingness to pay?",
        limit: 8,
      },
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      question: "What are monetization and willingness to pay?",
      evidence: expect.arrayContaining([
        expect.objectContaining({ id: "monetization-free-access" }),
        expect.objectContaining({ id: "free-product-tools" }),
      ]),
    });

    await client.close();
    await server.close();
  });
});
