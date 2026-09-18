"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { getWebMcpDestination, webMcpDestinations } from "@/lib/web-mcp";

const remoteMcpUrl = "https://magic-brain-mcp.assarasua.workers.dev/mcp";

const authenticatedToolNames = new Set([
  "get_personalized_opportunities",
  "get_predict_recommendation",
  "get_portfolio_intelligence",
  "list_portfolio_lists",
  "get_portfolio_list",
  "add_to_portfolio",
  "add_to_watchlist",
  "remove_from_watchlist",
  "create_portfolio_list",
  "rename_portfolio_list",
  "remove_portfolio_holdings",
]);

type JsonSchema = Record<string, unknown>;
type WebMcpResult = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};
type WebMcpTool = {
  name: string;
  title?: string;
  description: string;
  inputSchema: JsonSchema;
  outputSchema?: JsonSchema;
  annotations?: Record<string, unknown>;
  execute: (input: Record<string, unknown>) => Promise<WebMcpResult> | WebMcpResult;
};
type ModelContext = {
  registerTool: (tool: WebMcpTool) => void;
  unregisterTool?: (name: string) => void;
};
type RemoteTool = Omit<WebMcpTool, "execute">;
type JsonRpcResponse<T> = {
  result?: T;
  error?: { code?: number; message?: string; data?: unknown };
};

function getModelContext() {
  const documentContext = (document as Document & { modelContext?: ModelContext }).modelContext;
  return documentContext ?? (navigator as Navigator & { modelContext?: ModelContext }).modelContext;
}

function parseMcpResponse<T>(body: string): JsonRpcResponse<T> {
  const payloads = body
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter(Boolean);
  const payload = payloads.at(-1) ?? body;
  return JSON.parse(payload) as JsonRpcResponse<T>;
}

async function remoteMcpRequest<T>(method: "tools/list" | "tools/call", params: Record<string, unknown>) {
  const response = await fetch(remoteMcpUrl, {
    method: "POST",
    headers: {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      "MCP-Protocol-Version": "2025-06-18",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method, params }),
  });
  const payload = parseMcpResponse<T>(await response.text());
  if (!response.ok || payload.error || !payload.result) {
    throw new Error(payload.error?.message ?? `Remote MCP request failed (${response.status}).`);
  }
  return payload.result;
}

function failure(message: string): WebMcpResult {
  return {
    isError: true,
    content: [{ type: "text", text: message }],
    structuredContent: { error: message },
  };
}

async function listPublicRemoteTools() {
  const { tools } = await remoteMcpRequest<{ tools: RemoteTool[] }>("tools/list", {});
  return tools.filter((tool) => !authenticatedToolNames.has(tool.name));
}

async function callRemoteTool(name: string, input: Record<string, unknown>) {
  try {
    return await remoteMcpRequest<WebMcpResult>("tools/call", {
      name,
      arguments: input,
    });
  } catch (error) {
    return failure(error instanceof Error ? error.message : `Unable to run ${name}.`);
  }
}

function navigationTool(router: ReturnType<typeof useRouter>): WebMcpTool {
  return {
    name: "navigate_magic_brain",
    title: "Navigate Magic Brain",
    description: "Open a named Magic Brain page. Use the remote research tools to retrieve card or market data.",
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
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    execute: ({ destination }) => {
      if (typeof destination !== "string") return failure("A destination is required.");
      const match = getWebMcpDestination(destination);
      if (!match) return failure(`Unknown Magic Brain destination: ${destination}`);
      router.push(match.path);
      return {
        content: [{ type: "text", text: `Opened ${match.label}.` }],
        structuredContent: { destination: match.id, path: match.path },
      };
    },
  };
}

export function WebMcpNavigation() {
  const router = useRouter();

  useEffect(() => {
    const modelContext = getModelContext();
    if (!modelContext?.registerTool) return;

    let active = true;
    const registeredNames: string[] = [];
    const register = (tool: WebMcpTool) => {
      modelContext.registerTool(tool);
      registeredNames.push(tool.name);
    };

    register(navigationTool(router));
    void listPublicRemoteTools()
      .then((tools) => {
        if (!active) return;
        for (const tool of tools) {
          register({
            ...tool,
            execute: (input) => callRemoteTool(tool.name, input),
          });
        }
      })
      .catch((error) => {
        console.error("Unable to register remote MCP tools in WebMCP", error);
      });

    return () => {
      active = false;
      for (const name of registeredNames) modelContext.unregisterTool?.(name);
    };
  }, [router]);

  return null;
}
