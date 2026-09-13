import { McpServer } from "@modelcontextprotocol/server";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  MagicBrainApiClient,
  MagicBrainApiError,
  type JsonValue,
} from "./api-client.js";
import type { MagicBrainMcpConfig } from "./config.js";
import type { RulesKnowledgeBaseOptions } from "./rules/knowledge-base.js";
import { registerRulesTools } from "./rules/tools.js";

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use an ISO date in YYYY-MM-DD format")
  .refine(
    (value) => Number.isFinite(Date.parse(`${value}T00:00:00Z`)),
    "Date must be a real calendar date",
  );
const cardId = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .describe("Magic Brain or canonical card identifier");
const setCode = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]{2,8}$/, "Set code must contain 2-8 lowercase letters or digits");
const cursor = z.string().max(512).optional();

const outputSchema = z.object({
  data: z.json(),
  attribution: z.object({
    service: z.literal("Magic Brain Public API"),
    source_url: z.string().url(),
    fetched_at: z.string(),
    notice: z.string(),
  }),
  request_id: z.string().optional(),
});

const annotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

export function createMagicBrainMcpServer(
  config: MagicBrainMcpConfig,
  fetchImpl: typeof fetch = fetch,
  rulesOptions?: RulesKnowledgeBaseOptions,
): McpServer {
  const api = new MagicBrainApiClient(config, fetchImpl);
  const server = new McpServer({
    name: "magic-brain",
    title: "Magic Brain",
    version: "0.1.0",
    description:
      "Read-only Magic: The Gathering card, set, market price, and latest-set opportunity data from the Magic Brain Public API.",
    websiteUrl: "https://github.com/assarasua/magic-brain",
  });

  server.registerTool(
    "search_cards",
    {
      title: "Search Magic Cards",
      description:
        "Search Magic Brain's public card catalogue by name or text, with optional set, color, rarity, and type filters. Use this to discover card IDs before requesting details or prices. Returns a bounded cursor-paginated page and never accesses user collections.",
      inputSchema: z.object({
        query: z.string().trim().min(2).max(120).describe("Card name or text"),
        set_code: setCode.optional(),
        rarity: z
          .enum(["common", "uncommon", "rare", "mythic", "special", "bonus"])
          .optional(),
        language: z.string().trim().min(2).max(10).optional(),
        cursor,
        limit: z.number().int().min(1).max(50).default(20),
      }),
      outputSchema,
      annotations,
    },
    async (input) =>
      callTool(config, () =>
        api.request("cards", {
          query: {
            q: input.query,
            set: input.set_code,
            rarity: input.rarity,
            language: input.language,
            cursor: input.cursor,
            limit: input.limit,
          },
        }),
      ),
  );

  server.registerTool(
    "get_card",
    {
      title: "Get Card Details",
      description:
        "Get public catalogue details for one Magic card by ID, including printing and set metadata when available. Does not return ownership, watchlist, portfolio, or user data.",
      inputSchema: z.object({ card_id: cardId }),
      outputSchema,
      annotations,
    },
    async ({ card_id }) =>
      callTool(config, () => api.request(`cards/${encodeURIComponent(card_id)}`)),
  );

  server.registerTool(
    "get_latest_prices",
    {
      title: "Get Latest Card Prices",
      description:
        "Get the latest available public market prices for up to 100 card IDs in one read-only request. Price records preserve the API's source, observation time, currency, and finish metadata and are not financial advice.",
      inputSchema: z.object({
        card_ids: z
          .array(cardId)
          .min(1)
          .max(100)
          .refine((ids) => new Set(ids).size === ids.length, {
            message: "card_ids must not contain duplicates",
          }),
      }),
      outputSchema,
      annotations,
    },
    async ({ card_ids }) =>
      callTool(config, () =>
        api.request("prices/latest", {
          method: "POST",
          body: { cardIds: card_ids },
        }),
      ),
  );

  server.registerTool(
    "get_price_history",
    {
      title: "Get Card Price History",
      description:
        "Get bounded public historical price observations for one card and date range. Use daily or weekly intervals; the maximum range is 366 days. Results are market observations, not investment guarantees.",
      inputSchema: z
        .object({
          card_id: cardId,
          start_date: date,
          end_date: date,
          finish: z.enum(["all", "nonfoil", "foil"]).default("all"),
        })
        .superRefine(({ start_date, end_date }, context) => {
          const start = Date.parse(`${start_date}T00:00:00Z`);
          const end = Date.parse(`${end_date}T00:00:00Z`);
          if (start > end) {
            context.addIssue({
              code: "custom",
              path: ["end_date"],
              message: "end_date must be on or after start_date",
            });
          } else if ((end - start) / 86_400_000 > 366) {
            context.addIssue({
              code: "custom",
              path: ["end_date"],
              message: "Date range must not exceed 366 days",
            });
          }
        }),
      outputSchema,
      annotations,
    },
    async ({
      card_id,
      start_date,
      end_date,
      finish: requestedFinish,
    }) =>
      callTool(config, () =>
        api.request(`cards/${encodeURIComponent(card_id)}/prices`, {
          query: {
            from: start_date,
            to: end_date,
            finish: requestedFinish,
          },
        }),
      ),
  );

  server.registerTool(
    "list_sets",
    {
      title: "List Magic Sets",
      description:
        "List normalized public Magic set metadata, optionally filtering by name/code, set type, release dates, and tabletop availability. Results are cursor-paginated and bounded.",
      inputSchema: z.object({
        query: z.string().trim().min(1).max(80).optional(),
        tabletop_only: z.boolean().default(true),
        cursor,
        limit: z.number().int().min(1).max(50).default(25),
      }),
      outputSchema,
      annotations,
    },
    async (input) =>
      callTool(config, () =>
        api.request("sets", {
          query: {
            q: input.query,
            tabletop: input.tabletop_only,
            cursor: input.cursor,
            limit: input.limit,
          },
        }),
      ),
  );

  server.registerTool(
    "get_latest_set_opportunities",
    {
      title: "Get Latest-Set Opportunities",
      description:
        "Get Magic Brain's transparent, read-only ranking of cards in the newest released tabletop expansion, or a requested set. Returns bounded signals such as momentum, stability, drawdown, risk, confidence, and rationale. These are research indicators, not financial advice.",
      inputSchema: z.object({
        set_code: setCode.optional(),
        minimum_confidence: z.number().min(0).max(1).default(0),
        limit: z.number().int().min(1).max(25).default(10),
      }),
      outputSchema,
      annotations,
    },
    async ({
      set_code: requestedSet,
      minimum_confidence,
      limit,
    }) =>
      callTool(config, () =>
        api.request("latest-set/opportunities", {
          query: {
            set: requestedSet,
            minimum_confidence,
            limit,
          },
        }),
      ),
  );

  registerRulesTools(server, {
    ...(rulesOptions ?? {
      indexPath:
        process.env.MAGIC_BRAIN_RULES_INDEX_PATH ??
        fileURLToPath(new URL("../rules-data/rules-index.json", import.meta.url)),
    }),
  });

  return server;
}

async function callTool(
  config: MagicBrainMcpConfig,
  operation: () => Promise<{
    data: JsonValue;
    sourceUrl: string;
    requestId?: string;
  }>,
) {
  try {
    const response = await operation();
    const output = {
      data: response.data,
      attribution: {
        service: "Magic Brain Public API" as const,
        source_url: response.sourceUrl,
        fetched_at: new Date().toISOString(),
        notice:
          "Price data retains source, as-of time, currency, and finish metadata supplied by the API. Magic: The Gathering is property of Wizards of the Coast. Not financial advice.",
      },
      ...(response.requestId ? { request_id: response.requestId } : {}),
    };
    const serialized = JSON.stringify(output);
    if (serialized.length > config.maxToolChars) {
      throw new MagicBrainApiError(
        "Tool result exceeded the safe output limit. Reduce limit, identifiers, or date range.",
        "RESPONSE_TOO_LARGE",
      );
    }
    return {
      content: [{ type: "text" as const, text: serialized }],
      structuredContent: output,
    };
  } catch (error) {
    const detail =
      error instanceof MagicBrainApiError
        ? {
            code: error.code,
            message: error.message,
            ...(error.status !== undefined ? { status: error.status } : {}),
            ...(error.requestId ? { request_id: error.requestId } : {}),
            ...(error.retryAfter ? { retry_after: error.retryAfter } : {}),
          }
        : {
            code: "INTERNAL_ERROR",
            message: "The connector could not complete the request.",
          };
    return {
      isError: true,
      content: [{ type: "text" as const, text: JSON.stringify({ error: detail }) }],
    };
  }
}
