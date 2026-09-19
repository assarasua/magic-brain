# Magic Brain WebMCP

The [public WebMCP guide](https://magicbrain.es/webmcp) explains browser setup,
all navigation destinations, public research tools, permissions and troubleshooting.
For external clients, use the [remote MCP guide](https://magicbrain.es/mcp).

The public guide starts with Instinct as the recommended browser-agent option
and includes Asier's explicitly public invitation. The invitation opens Instinct;
it does not enable or certify WebMCP automatically. Readers must verify both
registration API availability and discovery in the agent's tool list.

The [browser compatibility list](https://magicbrain.es/webmcp#compatibility)
distinguishes the recommendation, Chrome's documented preview, and Edge,
Brave/Arc and Firefox/Safari environments that Magic Brain has not verified.
It does not infer support from a browser's engine or from remote MCP support.

## Page registration

Magic Brain checks `document.modelContext`, then `navigator.modelContext`, and
registers tools when the selected context provides `registerTool`. It unregisters
them on cleanup when `unregisterTool` is available. A compatible browser agent is
required; a normal browser is not assumed to support this evolving capability.

The page registers `navigate_magic_brain` locally. It then fetches the hosted
MCP `tools/list`, excludes the 11 account-only tools, and registers the 21 public
research tools with their published schemas. Research calls forward `tools/call`
to the hosted server and preserve its content/structured result. The website
session is not forwarded as OAuth authorization.

## Navigation

Pass a required `destination` from `src/lib/web-mcp.ts`. The tool returns the
accepted `destination` and `path` and navigates with the application router.
Arbitrary URLs and external origins are rejected. Opening a private area still
requires the normal website session; navigation does not submit forms or authorize
account actions. The public guide renders the destination table from this map.

## Permissions and operational behavior

The browser bridge excludes personal opportunities, predictions, portfolio
intelligence, list reads and all account writes. Use remote MCP with OAuth for
these tools. Public research retains the same source, date, evidence, pagination
and error rules documented in [mcp-tools.md](mcp-tools.md).

Local navigation can register before remote discovery succeeds. Missing research
tools may indicate connectivity, origin or client limitations. The guide’s browser
check only detects the registration API; it does not certify agent connectivity.
Mock remote discovery in isolated UI tests; the hosted service may reject random
localhost origins. Do not disable browser-origin protections.

Remote requests use the service’s MCP audit and privacy behavior. Optional request
summary/context must contain only non-personal intent, never copied conversations,
credentials or private notes. See the public MCP guide and privacy policy.
