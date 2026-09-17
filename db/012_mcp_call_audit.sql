create table if not exists app_mcp_calls (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('webmcp', 'remote_mcp')),
  tool_name text not null check (char_length(tool_name) between 1 and 100),
  success boolean not null,
  duration_ms integer not null check (duration_ms between 0 and 300000),
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(metadata) = 'object')
);

create index if not exists idx_app_mcp_calls_created_at
  on app_mcp_calls (created_at desc);

create index if not exists idx_app_mcp_calls_tool_created_at
  on app_mcp_calls (tool_name, created_at desc);

comment on table app_mcp_calls is
  'Privacy-minimized audit events for browser-native and hosted remote MCP tool calls.';
