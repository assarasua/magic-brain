import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  RulesKnowledgeBase,
  type RulesKnowledgeBaseOptions,
} from "./knowledge-base.js";
import { requestSummaryInput } from "../request-summary.js";

const inputBase = {
  limit: z.number().int().min(1).max(10).default(5),
  max_excerpt_chars: z.number().int().min(80).max(600).default(360),
  include_glossary: z.boolean().default(true),
};

const citationSchema = z.object({
  ruleNumber: z.string().optional(),
  glossaryTerm: z.string().optional(),
  section: z.string(),
  page: z.number().int().positive(),
  sourceUrl: z.string().url(),
});

const hitSchema = z.object({
  score: z.number(),
  excerpt: z.string().max(602),
  citation: citationSchema,
});

const sourceSchema = z.object({
  version: z.string(),
  effectiveDate: z.string(),
  fetchedAt: z.string(),
  sourceUrl: z.string().url(),
  rulesPageUrl: z.string().url(),
  sha256: z.string(),
  matchesPinnedOfficialSource: z.boolean(),
  freshnessNotice: z.string(),
  attribution: z.string(),
});

const annotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

export function registerRulesTools(
  server: McpServer,
  options: RulesKnowledgeBaseOptions,
): void {
  const rules = new RulesKnowledgeBase(options);

  server.registerTool(
    "search_rules",
    {
      title: "Search Comprehensive Rules",
      description:
        "Search a pinned local lexical index of the official Magic: The Gathering Comprehensive Rules and glossary. Returns bounded official excerpts with rule, section, PDF page, checksum, freshness, and source URL citations.",
      inputSchema: z.object({
        ...requestSummaryInput,
        query: z.string().trim().min(2).max(300),
        ...inputBase,
      }),
      outputSchema: z.object({
        results: z.array(hitSchema).max(10),
        source: sourceSchema,
      }),
      annotations,
    },
    async ({
      query,
      limit,
      max_excerpt_chars: maxExcerptChars,
      include_glossary: includeGlossary,
    }) =>
      rulesResult(() =>
        rules.search({
          query,
          limit,
          maxExcerptChars,
          includeGlossary,
        }),
      ),
  );

  server.registerTool(
    "ask_rules",
    {
      title: "Ask Comprehensive Rules",
      description:
        "Retrieve official Magic Comprehensive Rules evidence for a rules question. Clearly separates bounded official excerpts from non-authoritative explanatory retrieval guidance; it does not issue judge rulings.",
      inputSchema: z.object({
        ...requestSummaryInput,
        question: z.string().trim().min(5).max(500),
        ...inputBase,
      }),
      outputSchema: z.object({
        question: z.string(),
        officialRules: z.array(hitSchema).max(10),
        explanatorySynthesis: z.object({
          authority: z.literal("non-authoritative"),
          text: z.string(),
        }),
        source: sourceSchema,
      }),
      annotations,
    },
    async ({
      question,
      limit,
      max_excerpt_chars: maxExcerptChars,
      include_glossary: includeGlossary,
    }) =>
      rulesResult(() =>
        rules.ask({
          question,
          limit,
          maxExcerptChars,
          includeGlossary,
        }),
      ),
  );
}

async function rulesResult(operation: () => Promise<object>) {
  try {
    const structuredContent = await operation();
    return {
      content: [
        { type: "text" as const, text: JSON.stringify(structuredContent) },
      ],
      structuredContent,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Rules lookup failed unexpectedly";
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            error: {
              code: "RULES_INDEX_UNAVAILABLE",
              message,
            },
          }),
        },
      ],
    };
  }
}
