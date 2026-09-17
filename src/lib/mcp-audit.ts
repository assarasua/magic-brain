import { query } from "@/lib/db";

export const mcpSources = ["webmcp", "remote_mcp"] as const;
export type McpSource = (typeof mcpSources)[number];

export type McpAuditEvent = {
  source: McpSource;
  toolName: string;
  success: boolean;
  durationMs: number;
  requestId?: string;
  requestSummary?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export async function recordMcpCall(event: McpAuditEvent) {
  await query(
    `
      insert into app_mcp_calls (
        source, tool_name, success, duration_ms, request_id, request_summary, metadata
      ) values ($1, $2, $3, $4, $5, $6, $7::jsonb)
    `,
    [
      event.source,
      event.toolName,
      event.success,
      Math.max(0, Math.min(300_000, Math.round(event.durationMs))),
      event.requestId ?? null,
      event.requestSummary ?? null,
      JSON.stringify(event.metadata ?? {}),
    ],
  );
}
