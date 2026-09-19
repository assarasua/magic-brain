import type { Metadata } from "next";
import { WebMcpGuide } from "@/components/integration-guides/webmcp-guide";

export const metadata: Metadata = {
  title: "Magic Brain WebMCP — Browser Tools & Navigation Guide",
  description: "Use Magic Brain through a compatible browser agent. Learn WebMCP navigation, public research tools, browser support, permissions, examples and troubleshooting.",
  alternates: { canonical: "/webmcp" },
  openGraph: { title: "Magic Brain WebMCP — Browser tools guide", description: "Browser navigation and public card research, with setup and practical examples.", url: "/webmcp", type: "website" },
};

export default function WebMcpPage() { return <WebMcpGuide />; }
