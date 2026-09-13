# Magic Brain Development MCP

This local contributor server is separate from the hosted public research MCP.
The public server remains anonymous and read-only. The development server can
use a developer's own scoped API key to inspect account-scoped contracts, but
it still exposes no mutations.

## Run

```bash
npm install --prefix integrations/magic-brain-dev-mcp
npm run build --prefix integrations/magic-brain-dev-mcp
MAGIC_BRAIN_DEV_API_BASE_URL=http://127.0.0.1:3000/api/v1/ \
MAGIC_BRAIN_API_KEY=mb_test_... \
npm start --prefix integrations/magic-brain-dev-mcp
```

It listens on `http://127.0.0.1:8790/mcp`; health is at `/healthz`. Add this
Streamable HTTP URL to Claude as a local custom connector, to
`.cursor/mcp.json` in Cursor, or to `.vscode/mcp.json` in VS Code (rename the
top-level `mcpServers` key to `servers` for VS Code):

```json
{
  "mcpServers": {
    "magic-brain-development": {
      "url": "http://127.0.0.1:8790/mcp"
    }
  }
}
```

Tools:

- `inspect_openapi_contract`
- `call_allowlisted_dev_api`
- `diagnose_dev_health`
- `validate_migrations`
- `inspect_model_artifact_status`
- `run_bounded_contract_suite`
- `generate_fixture_request`

Only named GET operations can be called. Test suites are selected from a fixed
enum. Migration and artifact inspection is confined to known repository
directories and returns bounded summaries. The server provides no arbitrary
shell, filesystem, URL, environment, database, or production-mutation tool.

Remote targets are rejected by default. To intentionally inspect an HTTPS
remote API read-only, set `MAGIC_BRAIN_DEV_ALLOW_REMOTE_READONLY=true`. API keys
are sent only as authorization headers and are redacted from tool output.
