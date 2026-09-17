create index if not exists idx_app_mcp_calls_metadata_gin
  on app_mcp_calls using gin (metadata);

create or replace view app_mcp_call_insights as
select
  id,
  created_at,
  source,
  tool_name,
  request_summary,
  metadata->>'prompt_intent' as prompt_intent,
  metadata->>'prompt_language' as prompt_language,
  metadata->>'requested_output_format' as requested_output_format,
  metadata->>'prompt_subject' as prompt_subject,
  metadata->>'auth_mode' as auth_mode,
  metadata->>'oauth_client_id' as oauth_client_id,
  metadata->>'oauth_scopes' as oauth_scopes,
  metadata->>'protocol_version' as protocol_version,
  metadata->>'client_user_agent' as client_user_agent,
  metadata->>'origin' as origin,
  metadata->>'argument_names' as argument_names,
  nullif(metadata->>'http_status', '')::integer as http_status,
  success,
  duration_ms,
  request_id
from app_mcp_calls;

comment on view app_mcp_call_insights is
  'Queryable, privacy-minimised MCP prompt context and request metadata. Original prompts and OAuth tokens are not collected.';
