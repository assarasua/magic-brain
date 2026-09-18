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
    ];

    for (const tool of tools) modelContext.registerTool(tool);
    return () => {
      for (const tool of tools) modelContext.unregisterTool?.(tool.name);
    };
  }, [router]);

  return null;
}
