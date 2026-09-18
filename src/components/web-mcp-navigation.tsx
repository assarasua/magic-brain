"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { getWebMcpDestination, webMcpDestinations } from "@/lib/web-mcp";

type Schema = Record<string, unknown>;
type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};
type Tool = {
  name: string;
  description: string;
  inputSchema: Schema;
  outputSchema: Schema;
  execute: (input: Record<string, unknown>) => Promise<ToolResult> | ToolResult;
};
type ModelContext = {
  registerTool: (tool: Tool) => void;
  unregisterTool?: (name: string) => void;
};

const cardSchema = {
  type: "object",
  description: "A Magic: The Gathering card returned by Magic Brain.",
  additionalProperties: true,
} as const;

function success(data: Record<string, unknown>, summary: string): ToolResult {
  return { content: [{ type: "text", text: summary }], structuredContent: data };
}

function failure(message: string): ToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: message }],
    structuredContent: { error: message },
  };
}

async function getJson(path: string) {
  const response = await fetch(path, { headers: { Accept: "application/json" } });
  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(typeof body.error === "string" ? body.error : "Magic Brain could not complete the request.");
  }
  return body;
}

async function postJson(path: string, input: Record<string, unknown>) {
  const response = await fetch(path, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(typeof body.error === "string" ? body.error : "Magic Brain could not complete the request.");
  }
  return body;
}

export function WebMcpNavigation() {
  const router = useRouter();

  useEffect(() => {
    const modelContext = (navigator as Navigator & { modelContext?: ModelContext }).modelContext;
    if (!modelContext?.registerTool) return;

    const tools: Tool[] = [
      {
        name: "navigate_magic_brain",
        description: "Open a named Magic Brain page. Use this for navigation, not for retrieving card or market data.",
        inputSchema: {
          type: "object",
          properties: {
            destination: {
              type: "string",
              enum: webMcpDestinations.map(({ id }) => id),
              description: webMcpDestinations.map(({ id, description }) => `${id}: ${description}`).join(" "),
            },
          },
          required: ["destination"],
          additionalProperties: false,
        },
        outputSchema: {
          type: "object",
          properties: {
            destination: { type: "string", description: "The validated destination ID." },
            path: { type: "string", description: "The internal path opened in Magic Brain." },
          },
          required: ["destination", "path"],
          additionalProperties: false,
        },
        execute: ({ destination }) => {
          if (typeof destination !== "string") return failure("A destination is required.");
          const match = getWebMcpDestination(destination);
          if (!match) return failure(`Unknown Magic Brain destination: ${destination}`);
          router.push(match.path);
          return success({ destination: match.id, path: match.path }, `Opened ${match.label}.`);
        },
      },
      {
        name: "search_magic_cards",
        description: "Search Magic Brain's Magic: The Gathering card catalogue by card name, optionally within one set.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", minLength: 1, maxLength: 100, description: "Full or partial card name." },
            set: { type: "string", minLength: 2, maxLength: 20, description: "Optional set code, such as MH3." },
          },
          required: ["query"],
          additionalProperties: false,
        },
        outputSchema: {
          type: "object",
          properties: { cards: { type: "array", items: cardSchema } },
          required: ["cards"],
          additionalProperties: false,
        },
        execute: async ({ query, set }) => {
          if (typeof query !== "string" || !query.trim()) return failure("A card name is required.");
          const params = new URLSearchParams({ q: query.trim() });
          if (typeof set === "string" && set.trim()) params.set("set", set.trim());
          try {
            const body = await getJson(`/api/cards/search?${params}`);
            const count = Array.isArray(body.cards) ? body.cards.length : 0;
            return success(body, `Found ${count} matching card${count === 1 ? "" : "s"}.`);
          } catch (error) {
            return failure(error instanceof Error ? error.message : "Card search failed.");
          }
        },
      },
      {
        name: "get_magic_market_movers",
        description: "Get cards with the largest price gains or losses over a supported time window.",
        inputSchema: {
          type: "object",
          properties: {
            direction: { type: "string", enum: ["gainers", "losers"], description: "Return price gainers or losers." },
            days: { type: "integer", enum: [1, 7, 30, 90], description: "Price-change window in days." },
            set: { type: "string", minLength: 2, maxLength: 20, description: "Optional set code." },
          },
          required: ["direction", "days"],
          additionalProperties: false,
        },
        outputSchema: {
          type: "object",
          properties: {
            cards: { type: "array", items: cardSchema },
            direction: { type: "string", enum: ["gainers", "losers"] },
            days: { type: "integer", enum: [1, 7, 30, 90] },
          },
          required: ["cards", "direction", "days"],
          additionalProperties: false,
        },
        execute: async ({ direction, days, set }) => {
          if (direction !== "gainers" && direction !== "losers") return failure("Direction must be gainers or losers.");
          if (![1, 7, 30, 90].includes(Number(days))) return failure("Days must be 1, 7, 30, or 90.");
          const params = new URLSearchParams({ direction, days: String(days) });
          if (typeof set === "string" && set.trim()) params.set("set", set.trim());
          try {
            const body = await getJson(`/api/market/movers?${params}`);
            const count = Array.isArray(body.cards) ? body.cards.length : 0;
            return success(body, `Returned ${count} ${direction} over ${days} days.`);
          } catch (error) {
            return failure(error instanceof Error ? error.message : "Market lookup failed.");
          }
        },
      },
      {
        name: "list_magic_sets",
        description: "List Magic: The Gathering sets available as filters in Magic Brain.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        outputSchema: {
          type: "object",
          properties: { sets: { type: "array", items: { type: "object", additionalProperties: true } } },
          required: ["sets"],
          additionalProperties: false,
        },
        execute: async () => {
          try {
            const body = await getJson("/api/sets");
            const count = Array.isArray(body.sets) ? body.sets.length : 0;
            return success(body, `Returned ${count} available sets.`);
          } catch (error) {
            return failure(error instanceof Error ? error.message : "Set lookup failed.");
          }
        },
      },
      {
        name: "build_portfolio_scenario",
        description:
          "Build a professional, read-only Magic card portfolio for one edition using Magic Brain's machine-learning opportunity signals. Returns allocations, quantities, model scores, confidence, rationale, and unallocated budget. The scenario is not saved and is not financial advice.",
        inputSchema: {
          type: "object",
          properties: {
            set_code: {
              type: "string",
              pattern: "^[a-zA-Z0-9]{2,8}$",
              description: "Magic edition or set code, such as MH3, FIN, or EOE.",
            },
            budget_eur: {
              type: "number",
              minimum: 25,
              maximum: 1000000,
              description: "Total portfolio budget in euros.",
            },
            risk: {
              type: "string",
              enum: ["preservation", "conservative", "balanced", "growth", "aggressive"],
              description: "Risk profile used to rank and allocate eligible cards.",
            },
            max_positions: {
              type: "integer",
              minimum: 1,
              maximum: 20,
              default: 8,
              description: "Maximum number of distinct cards in the portfolio.",
            },
          },
          required: ["set_code", "budget_eur", "risk"],
          additionalProperties: false,
        },
        outputSchema: {
          type: "object",
          properties: {
            data: {
              type: "object",
              properties: {
                set: { type: "object", additionalProperties: true },
                asOf: { type: ["string", "null"] },
                scenario: {
                  type: "object",
                  properties: {
                    budget: { type: "number" },
                    invested: { type: "number" },
                    unallocated: { type: "number" },
                    risk: { type: "string" },
                    positions: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          card: cardSchema,
                          quantity: { type: "integer" },
                          unitPrice: { type: "number" },
                          allocation: { type: "number" },
                          portfolioWeight: { type: "number" },
                          modelScore: { type: "number" },
                          signal: { type: "object", additionalProperties: true },
                          rationale: { type: "array", items: { type: "string" } },
                        },
                        required: ["card", "quantity", "unitPrice", "allocation", "portfolioWeight", "modelScore", "signal", "rationale"],
                        additionalProperties: false,
                      },
                    },
                    methodology: { type: "object", additionalProperties: true },
                  },
                  required: ["budget", "invested", "unallocated", "risk", "positions", "methodology"],
                  additionalProperties: false,
                },
                signalMethodology: { type: "object", additionalProperties: true },
              },
              required: ["set", "asOf", "scenario", "signalMethodology"],
              additionalProperties: false,
            },
            attribution: { type: "object", additionalProperties: true },
            request_id: { type: "string" },
          },
          required: ["data", "attribution"],
          additionalProperties: false,
        },
        execute: async ({ set_code, budget_eur, risk, max_positions }) => {
          if (typeof set_code !== "string" || !/^[a-z0-9]{2,8}$/i.test(set_code)) {
            return failure("Set code must contain 2 to 8 letters or digits.");
          }
          if (typeof budget_eur !== "number" || budget_eur < 25 || budget_eur > 1_000_000) {
            return failure("Budget must be between €25 and €1,000,000.");
          }
          const risks = ["preservation", "conservative", "balanced", "growth", "aggressive"];
          if (typeof risk !== "string" || !risks.includes(risk)) return failure("Choose a supported risk profile.");
          const positions = max_positions === undefined ? 8 : Number(max_positions);
          if (!Number.isInteger(positions) || positions < 1 || positions > 20) {
            return failure("Maximum positions must be an integer from 1 to 20.");
          }
          try {
            const body = await postJson("/api/v1/predict/portfolio", {
              setCode: set_code.toLowerCase(),
              budget: budget_eur,
              risk,
              maxPositions: positions,
            });
            const data = body.data as Record<string, unknown> | undefined;
            const scenario = data?.scenario as Record<string, unknown> | undefined;
            const count = Array.isArray(scenario?.positions) ? scenario.positions.length : 0;
            return success(body, `Built an unsaved ${risk} portfolio with ${count} position${count === 1 ? "" : "s"}.`);
          } catch (error) {
            return failure(error instanceof Error ? error.message : "Portfolio construction failed.");
          }
        },
      },
    ];

    for (const tool of tools) modelContext.registerTool(tool);
    return () => {
      for (const tool of tools) modelContext.unregisterTool?.(tool.name);
    };
  }, [router]);

  return null;
}
