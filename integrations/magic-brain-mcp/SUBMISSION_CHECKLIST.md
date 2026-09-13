# Deployment and directory submission checklist

The public API and MCP endpoint are deployed. Anthropic Directory submission
has not been performed.

## 1. Finish and verify the public API

- [x] Deploy the planned `/api/v1/` public API.
- [x] Confirm the six paths and parameter names documented in `PACKAGE.md`.
- [ ] Confirm every price record includes source, as-of date/time, currency,
      and finish.
- [ ] Confirm API responses cannot include users, portfolios, watchlists,
      API-key records, authentication data, Stripe data, or internal secrets.
- [ ] Run these package tests plus live contract tests against a staging API.

## 2. Deploy the MCP endpoint

- [x] Deploy `https://magic-brain-mcp.assarasua.workers.dev/mcp`.
- [x] Configure the deployed `/api/v1/` URL.
- [ ] Optionally configure `MAGIC_BRAIN_API_KEY` in the deployment secret
      store, never in source or connector settings.
- [ ] Set `MCP_ALLOWED_HOSTS` to the public MCP hostname.
- [ ] Keep the process private behind a TLS reverse proxy, or set
      `MCP_BIND_HOST=0.0.0.0` only when the hosting platform requires it.
- [ ] Add edge rate limits, request logs that redact authorization headers,
      uptime monitoring, and an HTTPS check for `/healthz`.
- [ ] Verify `POST https://<host>/mcp` with MCP Inspector and exercise every
      tool with valid, invalid, empty, rate-limited, timeout, and oversized
      responses.
- [ ] Add the deployed URL as a custom connector in Claude and test every tool.

## 3. Finalize standard MCP Registry metadata

- [x] Record the deployed HTTPS MCP URL in `server.json`.
- [ ] Confirm the icon raw URL is public after the repository is public.
- [ ] Confirm the `io.github.assarasua` namespace can be authenticated by the
      publishing GitHub account.
- [ ] Run `mcp-publisher validate`.
- [ ] Optionally publish to the preview official MCP Registry with
      `mcp-publisher publish`. Registry publication is separate from
      Anthropic's Connectors Directory and metadata versions are immutable.

## 4. Prepare Anthropic listing fields

- [ ] Name (maximum 100 characters): `Magic Brain`
- [ ] Tagline (maximum 55 characters):
      `MTG cards, prices, sets, and market signals`
- [ ] Description: explain the six public-data tools and two rules tools,
      price-source attribution, bounded output, and no financial guarantees.
- [ ] Select one to five relevant categories in the portal.
- [ ] Provide public documentation, website, privacy policy, and support URLs.
- [ ] Upload `directory/icon.svg` or the portal's required derivative.
- [ ] Prepare a fully populated reviewer test account if the deployed public
      API requires authentication. Prefer anonymous MCP access backed by a
      server-side API key; authenticated directory services generally require
      OAuth 2.0.
- [ ] Confirm all tool titles and annotations appear correctly in
      `tools/list`.
- [ ] Confirm compliance with Anthropic's current Software Directory Policy.

This connector is not an MCP App and has no interactive UI, so carousel
screenshots are not currently required.

## 5. Exact remaining Anthropic publication step

An authorized owner must sign in to a Claude Team or Enterprise organization,
open **Organization settings → Directory**, create a remote MCP server
submission, enter the deployed HTTPS `/mcp` URL and listing details, provide
review credentials if requested, and submit it for Anthropic review.

That portal action requires account ownership/Directory permission and manual
review. It cannot be completed from this repository and has not been claimed
as complete.
