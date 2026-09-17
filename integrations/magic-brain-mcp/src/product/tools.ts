import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  CANONICAL_PRODUCT_DOCUMENT,
  getProductContext,
  searchProductKnowledge,
} from "./knowledge.js";
import { PRODUCT_STATUSES, PRODUCT_TOPICS } from "./types.js";
import { requestSummaryInput } from "../request-summary.js";

const statusSchema = z.enum(PRODUCT_STATUSES);
const topicSchema = z.enum(PRODUCT_TOPICS);
const citationSchema = z.object({
  label: z.string(),
  url: z.string().url(),
});
const factSchema = z.object({
  id: z.string(),
  topic: topicSchema,
  status: statusSchema,
  statement: z.string(),
  keywords: z.array(z.string()),
  citations: z.array(citationSchema).min(1),
  score: z.number(),
});
const taxonomySchema = z.record(statusSchema, z.string());
const commonOutput = {
  results: z.array(factSchema).max(12),
  taxonomy: taxonomySchema,
  canonicalDocument: z.string().url(),
  retrievalNotice: z.string(),
};

const annotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

export function registerProductKnowledgeTools(server: McpServer): void {
  server.registerTool(
    "search_product_knowledge",
    {
      title: "Search Magic Brain Product Knowledge",
      description:
        "Search the canonical, deterministic Magic Brain product/business knowledge base. Returns bounded source-cited statements with explicit epistemic status for positioning, moat, users, metrics, monetization, trust, risk, incidents, growth, liquidity, signals, and adjacent TCG diligence.",
      inputSchema: z.object({
        ...requestSummaryInput,
        query: z.string().trim().min(2).max(500),
        topics: z.array(topicSchema).max(PRODUCT_TOPICS.length).optional(),
        statuses: z.array(statusSchema).max(PRODUCT_STATUSES.length).optional(),
        limit: z.number().int().min(1).max(12).default(8),
      }),
      outputSchema: z.object({
        query: z.string(),
        ...commonOutput,
      }),
      annotations,
    },
    async ({ query, topics, statuses, limit }) =>
      productResult(
        searchProductKnowledge({
          query,
          ...(topics ? { topics } : {}),
          ...(statuses ? { statuses } : {}),
          limit,
        }),
      ),
  );

  server.registerTool(
    "get_product_context",
    {
      title: "Get Magic Brain Product Context",
      description:
        "Retrieve a bounded canonical evidence bundle for one or more Magic Brain diligence topics. Use it for broad product or business analysis where all returned claims must retain their shipped fact, operating principle, hypothesis, roadmap option, or unknown/not measured status.",
      inputSchema: z.object({
        ...requestSummaryInput,
        topics: z.array(topicSchema).min(1).max(6),
        statuses: z.array(statusSchema).max(PRODUCT_STATUSES.length).optional(),
        limit: z.number().int().min(1).max(12).default(12),
      }),
      outputSchema: z.object({
        topics: z.array(topicSchema),
        ...commonOutput,
      }),
      annotations,
    },
    async ({ topics, statuses, limit }) =>
      productResult(
        getProductContext({
          topics,
          ...(statuses ? { statuses } : {}),
          limit,
        }),
      ),
  );

  server.registerTool(
    "ask_product_question",
    {
      title: "Ask About Magic Brain",
      description:
        "Retrieve source-cited canonical evidence for a Magic Brain product or business question without calling another LLM. The host should synthesize the answer, preserve every epistemic status, state unknowns directly, and avoid unsupported metrics or superiority claims.",
      inputSchema: z.object({
        ...requestSummaryInput,
        question: z.string().trim().min(5).max(800),
        limit: z.number().int().min(1).max(12).default(10),
      }),
      outputSchema: z.object({
        question: z.string(),
        evidence: z.array(factSchema).max(12),
        answerInstructions: z.array(z.string()),
        taxonomy: taxonomySchema,
        canonicalDocument: z.string().url(),
        retrievalNotice: z.string(),
      }),
      annotations,
    },
    async ({ question, limit }) => {
      const result = searchProductKnowledge({ query: question, limit });
      return productResult({
        question,
        evidence: result.results,
        answerInstructions: [
          "Synthesize only from returned evidence and cite the relevant URLs.",
          "Preserve each statement's epistemic status; separate shipped facts from principles, hypotheses, roadmap options, and unknowns.",
          "Explicitly say unknown/not measured for unsupported AUM-equivalent, conversion, retention, willingness-to-pay, market-size, user-behavior, incident/SLA, or competitive-superiority claims.",
          "Describe Magic Brain as research and portfolio intelligence, never as a trading or execution venue.",
          "Do not interpret a confidence score as probability of profit or omit liquidity, provenance, freshness, and non-financial-advice caveats when relevant.",
        ],
        taxonomy: result.taxonomy,
        canonicalDocument: CANONICAL_PRODUCT_DOCUMENT,
        retrievalNotice: result.retrievalNotice,
      });
    },
  );
}

function productResult(structuredContent: object) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(structuredContent) }],
    structuredContent,
  };
}
