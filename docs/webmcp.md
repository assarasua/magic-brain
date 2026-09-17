# Navigate Magic Brain with WebMCP

Magic Brain exposes a browser-native WebMCP tool on every page:

```text
navigate_magic_brain
```

The tool lets an AI agent navigate to a named Magic Brain area without guessing
URLs or clicking through menus. It is registered automatically when the website
loads in a WebMCP-capable browser. There is nothing to install and no API key or
remote endpoint to configure.

## Input

The tool accepts one required `destination` string. Supported destinations are:

`overview`, `market`, `latest-set-watch`, `portfolio`, `inventory`, `discover`,
`watchlist`, `reserved-list`, `brain`, `signals`, `analyst`, `predict`, `settings`,
and `developers`.

## Safety model

- Destinations are resolved through a fixed application-owned allowlist.
- Arbitrary URLs, query strings, and external origins are not accepted.
- The tool only navigates. It does not submit forms, mutate account data, or
  perform purchases.
- Existing authentication rules still apply. Signed-out visitors who request a
  private area are sent through the normal sign-in flow.

## Audit records

Successful WebMCP navigation calls are recorded in `app_mcp_calls`. The audit
record contains the source, tool name, success status, duration, destination,
and timestamp. It does not contain prompts, page contents, credentials, or
personal data.

Hosted remote MCP calls are stored in the same table with `source =
'remote_mcp'`. Remote tool arguments and responses are deliberately excluded.

Recent activity can be inspected with:

```sql
select created_at, source, tool_name, success, duration_ms, metadata
from app_mcp_calls
order by created_at desc
limit 100;
```

## Browser support

WebMCP is currently an early-preview browser capability. Unsupported browsers
ignore the registration and Magic Brain continues to work normally. Use the
hosted remote MCP documented in [MCP installation](mcp-installation.md) for
ChatGPT, Claude, Cursor, VS Code, and OpenAI API integrations.
