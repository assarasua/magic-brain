# Magic Brain CLI

Local developer CLI for the versioned Magic Brain API. It has no telemetry and
never prints API keys.

```bash
npm install --prefix tools/magic-brain-cli
npm run build --prefix tools/magic-brain-cli
node tools/magic-brain-cli/dist/index.js --help
```

Configure with `MAGIC_BRAIN_BASE_URL` (defaults to
`https://magicbrain.es/api/v1/`), `MAGIC_BRAIN_API_KEY`, and optionally
`MAGIC_BRAIN_LOCALE=en|es`. Flags with the same names override environment
configuration:

```bash
MAGIC_BRAIN_API_KEY=mb_test_... \
  node tools/magic-brain-cli/dist/index.js doctor \
  --base-url http://127.0.0.1:3000/api/v1/ \
  --mcp-url http://127.0.0.1:8788/healthz

node tools/magic-brain-cli/dist/index.js cards search \
  --query lotus --limit 10 --json
node tools/magic-brain-cli/dist/index.js graph neighbours \
  --query "The One Ring"
node tools/magic-brain-cli/dist/index.js portfolio forecast

# Safe list/share/bulk mutations require both controls
node tools/magic-brain-cli/dist/index.js portfolio list-create \
  --name "Trade binder" --confirm \
  --idempotency-key "$(uuidgen | tr '[:upper:]' '[:lower:]')"
```

Interactive login uses OAuth authorization code with S256 PKCE:

```bash
# Least privilege (public:read only)
node tools/magic-brain-cli/dist/index.js auth login

# Opt in to personal reads
node tools/magic-brain-cli/dist/index.js auth login \
  --scopes public:read,portfolio:read,profile:read
node tools/magic-brain-cli/dist/index.js auth status
node tools/magic-brain-cli/dist/index.js auth logout
```

On macOS tokens are stored in Keychain. Where secure storage is unavailable,
the CLI warns and uses `~/.config/magic-brain/credentials.json` with mode 0600.
Access tokens last 15 minutes; refresh tokens rotate and are never printed.

Exit codes are `0` for success, `2` for usage/validation errors, `3` for
authentication or scope errors, and `4` for network/upstream failures. GET
requests use bounded retries; mutations are never retried automatically.

Account reads and mutations require the documented granular scopes. Every
list/share/bulk mutation requires both `--confirm` and
`--idempotency-key`; retries with the same key safely replay the result.
