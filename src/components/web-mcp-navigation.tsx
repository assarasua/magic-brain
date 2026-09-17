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
  execute: (input: { destination?: unknown }) => Promise<WebMcpResult> | WebMcpResult;
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
        },
        required: ["destination"],
        additionalProperties: false,
      },
      execute: ({ destination }) => {
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
        return {
          content: [{ type: "text", text: `Navigating to ${match.label} (${match.path}).` }],
        };
      },
    });

    return () => modelContext.unregisterTool?.(toolName);
  }, [router]);

  return null;
}
