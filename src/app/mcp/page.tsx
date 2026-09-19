import type { Metadata } from "next";
import { McpGuide } from "@/components/integration-guides/mcp-guide";

export const metadata: Metadata = {
  title: "Magic Brain MCP — Setup, Tools & Card Rules Guide",
  description: "Connect your assistant to Magic Brain. A complete guide to all MCP tools, Oracle text, card rulings, prices, collection permissions, examples and troubleshooting.",
  alternates: { canonical: "/mcp" },
  openGraph: { title: "Magic Brain MCP — The complete guide", description: "Setup, every tool, card rules, OAuth permissions and practical examples.", url: "/mcp", type: "website" },
};

export default function McpPage() { return <McpGuide />; }
