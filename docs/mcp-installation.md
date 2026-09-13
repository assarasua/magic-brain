# Install the Magic Brain MCP connector

Connect a supported MCP client to Magic Brain's live, read-only remote server:

```text
https://magic-brain-mcp.assarasua.workers.dev/mcp
```

The transport is **Streamable HTTP**. Public research works anonymously.
Supported clients can optionally use Magic Brain OAuth to unlock personal
read tools after Google sign-in and explicit consent. Never paste a Magic Brain
API key into a hosted connector.

The server advertises RFC 9728 protected-resource metadata and RFC 8414
authorization-server metadata. Authorization uses OAuth authorization code
with S256 PKCE and RFC 8707 resource binding. Access tokens last 15 minutes;
refresh tokens last 30 days and rotate on every use.

After connecting, use the canonical [MCP tool reference](mcp-tools.md) for all
tool inputs, outputs, scopes, limits, examples, evidence rules, and errors.

In addition to card, price, set, and rules retrieval, the connector exposes
deterministic, source-cited product research. Claude can use it for diligence on
Magic Brain's positioning, moat, users, monetization, provenance, regulatory
posture, trust, incidents, liquidity, signals, growth hypotheses, and adjacent
TCG options. Claims retain an explicit epistemic status, and unknown business
metrics are returned as unknown rather than estimated. See the canonical
[product strategy and FAQ](product-strategy-faq.md).

> This guide installs the hosted endpoint. It does not run code on your
> computer. For local development or self-hosting, follow
> [`integrations/magic-brain-mcp/PACKAGE.md`](../integrations/magic-brain-mcp/PACKAGE.md#run-locally)
> and use your own URL. A local `127.0.0.1` endpoint is not a substitute for the
> public URL in cloud-hosted clients such as Claude or ChatGPT.

## Claude

Custom remote connectors are available on Claude Free, Pro, Max, Team, and
Enterprise. Free accounts are limited to one custom connector.

### Free, Pro, or Max

1. Open **Customize > Connectors**.
2. Select **Add custom connector**.
3. Name it `Magic Brain`.
4. Enter `https://magic-brain-mcp.assarasua.workers.dev/mcp` as the MCP server
   URL.
5. Choose anonymous access for public research, or complete Magic Brain sign-in
   when Claude offers authorization for personal tools.
6. In a chat, use the **+** menu, open **Connectors**, and enable Magic Brain.

### Team or Enterprise

An Owner must first open **Organization settings > Connectors**, select **Add**,
then **Custom** (and **Web** if prompted), enter the same endpoint, choose no
sign-in, and add it. Members can then open **Customize > Connectors**, find the
connector labeled **Custom**, and select **Connect**.

Claude connects from Anthropic's cloud, so only the live public URL works
directly. Organization policy may prevent members from adding a connector.

## Cursor

Cursor documents both project and global MCP configuration. Create
`.cursor/mcp.json` in one project, or `~/.cursor/mcp.json` to make the server
available in every project:

```json
{
  "mcpServers": {
    "magic-brain": {
      "url": "https://magic-brain-mcp.assarasua.workers.dev/mcp"
    }
  }
}
```

Open **Customize** in the Cursor sidebar, find Magic Brain, and enable or refresh
it. Cursor infers the remote transport from `url`; do not add a local `command`
or an undocumented transport field.

Cursor's public MCP documentation does not state a separate consumer plan
requirement. On managed teams, an administrator can restrict remote server URLs
with the Enterprise MCP allowlist under **Team Settings > MCP Configuration**.

## VS Code with GitHub Copilot

Requirements:

- Visual Studio Code 1.99 or later
- access to GitHub Copilot
- for Copilot Business or Enterprise seats, the organization's **MCP servers in
  Copilot** policy must be enabled (it is disabled by default)

Create `.vscode/mcp.json` for this workspace:

```json
{
  "servers": {
    "magic-brain": {
      "type": "http",
      "url": "https://magic-brain-mcp.assarasua.workers.dev/mcp"
    }
  }
}
```

Alternatively, run **MCP: Add Server** from the Command Palette and choose
Workspace or Global when prompted. Confirm that you trust the server, then run
**MCP: List Servers** to start or inspect it. In Copilot Chat, select **Agent**
mode and use **Configure Tools** to verify that the Magic Brain tools are
enabled.

For a personal configuration instead of a checked-in workspace file, run
**MCP: Open User Configuration** and add the same server object there.

## ChatGPT

Custom MCP apps require developer mode on ChatGPT web. Current OpenAI guidance
allows Pro users to connect read/fetch MCPs in developer mode. Full MCP support
is available to Business and Enterprise/Edu; Business creation is restricted
to admins, while Enterprise/Edu access and publishing are controlled by admins,
owners, and RBAC.

1. Enable **Developer mode** under **Settings > Apps > Advanced Settings**. A
   workspace administrator may first need to grant access.
2. Admins and owners can use **Workspace settings > Apps > Create**. Authorized
   users can use **Settings > Apps > Create**.
3. Enter the required app metadata and
   `https://magic-brain-mcp.assarasua.workers.dev/mcp` as the endpoint.
4. Keep authentication optional for public research. Complete Magic Brain
   OAuth when prompted to use personal tools.
5. Select **Scan Tools**, wait for discovery to finish, then select **Create**.

If **Create**, **Developer mode**, or the authentication option is absent, the
account's plan, role, region, or workspace policy may not support custom MCP
apps. Ask the workspace administrator rather than substituting a local URL.

## OpenAI Responses API

The OpenAI Responses API accepts arbitrary remote MCP servers through the
`mcp` built-in tool. Add this object to the request's `tools` array:

```json
{
  "type": "mcp",
  "server_label": "magic_brain",
  "server_description": "Read-only Magic card, price, rules, and source-cited Magic Brain product research.",
  "server_url": "https://magic-brain-mcp.assarasua.workers.dev/mcp"
}
```

This requires an OpenAI API account, API key, a model that supports the MCP
tool, and normal API billing. That OpenAI API key authenticates the request to
OpenAI; it is not sent to or required by Magic Brain. OpenAI's maintained
connectors use `connector_id`, while this independently hosted server correctly
uses `server_url`.

## Verify and troubleshoot

Check the deployment independently of a client:

```bash
curl --fail https://magic-brain-mcp.assarasua.workers.dev/healthz
```

A healthy deployment returns JSON containing `"status":"ok"` and
`"transport":"streamable-http"`. The health check verifies process and
configuration health; it does not call the upstream Magic Brain API.

- **URL:** Copy the complete HTTPS endpoint, including `/mcp`. Do not use the
  website URL, the `/healthz` URL, or add a trailing `/sse`.
- **Transport:** Choose HTTP or Streamable HTTP when a client asks. The MCP
  endpoint expects protocol requests, so opening it in a browser is not a valid
  connection test.
- **Authentication:** Do not configure custom bearer headers. Anonymous tools
  need no credentials. Personal tools return `AUTHENTICATION_REQUIRED` until
  browser sign-in and consent complete. A `403` means a named scope is absent.
- **Discovery or connection errors:** Confirm `/healthz` first, then restart or
  refresh the server in the client and inspect that client's MCP logs or output.
- **Organization restrictions:** Ask an administrator to allow the exact
  endpoint and enable custom MCP servers. Claude, Cursor, Copilot, and ChatGPT
  all expose organization controls that can override personal configuration.
- **Unsupported clients:** A client must support remote Streamable HTTP MCP.
  Clients that support only local `stdio`, legacy SSE, or a curated connector
  directory cannot use this endpoint directly. Use a supported client; do not
  change the endpoint path or wrap it in an untrusted proxy.
- **Local self-hosting:** Local setup uses
  `http://127.0.0.1:8788/mcp` by default and has separate host/origin
  configuration. Cloud clients cannot reach that loopback address.

## Consent scopes

- `public:read` — public research (anonymous access remains available)
- `portfolio:read` / `portfolio:write` — owned holdings and mutations
- `lists:read` / `lists:write` — owned list data and lifecycle
- `alerts:manage` — owned alert changes
- `shares:manage` — owned share-link creation and revocation
- `profile:read` — preference-derived personalization

The hosted MCP currently exposes personal reads only. It does not expose
account mutations even when a token carries a write scope. Future mutation
tools must additionally require an idempotency key and explicit
`confirm: true`.

For contributor diagnostics, use the separate
[`magic-brain-dev-mcp`](../integrations/magic-brain-dev-mcp/README.md). It is
localhost-only by default and is not the public research connector.

## Official documentation consulted

Checked on 13 September 2026:

- [Anthropic: Third party connectors with remote MCP](https://claude.com/docs/connectors/custom/remote-mcp)
- [Anthropic: Get started with custom connectors using remote MCP](https://support.anthropic.com/en/articles/11175166-getting-started-with-custom-connectors-using-remote-mcp)
- [Cursor: Model Context Protocol (MCP)](https://cursor.com/docs/mcp)
- [Visual Studio Code: Add and manage MCP servers](https://code.visualstudio.com/docs/copilot/customization/mcp-servers)
- [GitHub: Extending Copilot Chat with MCP servers](https://docs.github.com/en/copilot/customizing-copilot/extending-copilot-chat-with-mcp)
- [OpenAI: Developer mode and MCP apps in ChatGPT](https://help.openai.com/en/articles/12584461)
- [OpenAI API: MCP and Connectors](https://developers.openai.com/api/docs/guides/tools-connectors-mcp)
