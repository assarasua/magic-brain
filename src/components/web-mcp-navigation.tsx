"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { getWebMcpDestination, webMcpDestinations } from "@/lib/web-mcp";

type WebMcpResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

type WebMcpTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (input: { destination?: unknown; request_summary?: unknown; request_context?: unknown }) => Promise<WebMcpResult> | WebMcpResult;
};

type ModelContext = {
  registerTool: (tool: WebMcpTool) => void;
  unregisterTool?: (name: string) => void;
};

const toolName = "navigate_magic_brain";

export function WebMcpNavigation() {
  const router = useRouter();

  useEffect(() => {
    const modelContext = (navigator as Navigator & { modelContext?: ModelContext }).modelContext;
    if (!modelContext?.registerTool) return;

    modelContext.registerTool({
      name: toolName,
      description:
        "Navigate to a named page in the Magic Brain website. Use this instead of guessing URLs or clicking through menus.",
      inputSchema: {
        type: "object",
        properties: {
          destination: {
            type: "string",
            enum: webMcpDestinations.map((destination) => destination.id),
            description: webMcpDestinations
              .map((destination) => `${destination.id}: ${destination.description}`)
              .join(" "),
          },
          request_summary: {
            type: "string",
            minLength: 1,
            maxLength: 500,
            description: "Optional short paraphrase of the user's navigation intent. Do not include the original prompt or personal data.",
          },
          request_context: {
            type: "object",
            description: "Optional privacy-safe metadata inferred from the request; never include the original prompt or personal data.",
            properties: {
              intent: { type: "string", enum: ["research", "compare", "monitor", "developer", "other"] },
              language: { type: "string", enum: ["en", "es", "other"] },
              output_format: { type: "string", enum: ["answer", "list", "table", "analysis", "action"] },
              subject: { type: "string", maxLength: 120 },
            },
            required: ["intent"],
            additionalProperties: false,
          },
        },
        required: ["destination"],
        additionalProperties: false,
      },
      execute: ({ destination, request_summary: requestSummary, request_context: requestContext }) => {
        const startedAt = performance.now();
        if (typeof destination !== "string") {
          return {
            isError: true,
            content: [{ type: "text", text: "A destination is required." }],
          };
        }

        const match = getWebMcpDestination(destination);
        if (!match) {
          return {
            isError: true,
            content: [{ type: "text", text: `Unknown Magic Brain destination: ${destination}` }],
          };
        }

        router.push(match.path);
        void fetch("/api/mcp/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source: "webmcp",
            toolName,
            destination: match.id,
            success: true,
            durationMs: performance.now() - startedAt,
            ...(typeof requestSummary === "string" && requestSummary.trim()
              ? { requestSummary: requestSummary.trim().slice(0, 500) }
              : {}),
            ...(requestContext && typeof requestContext === "object" ? { requestContext } : {}),
          }),
          keepalive: true,
        }).catch(() => undefined);
        return {
          content: [{ type: "text", text: `Navigating to ${match.label} (${match.path}).` }],
        };
      },
    });

    return () => modelContext.unregisterTool?.(toolName);
  }, [router]);

  return null;
}
