#!/usr/bin/env node
import { ApiClient, CliError, normalizeBaseUrl } from "./client.js";
import { accessToken, authStatus, login, logout } from "./auth.js";

type Flags = Record<string, string | boolean>;
type Envelope = {
  data?: unknown;
  meta?: { pagination?: { nextCursor?: string | null } };
};

const HELP = `Magic Brain CLI

Usage: magic-brain [global options] <command> [subcommand] [options]

Global options:
  --base-url URL    API root (default MAGIC_BRAIN_BASE_URL or https://magicbrain.es/api/v1/)
  --api-key KEY     API key (default MAGIC_BRAIN_API_KEY; never printed)
  --locale en|es    Response locale where supported (default en)
  --timeout MS      Request timeout (default 10000)
  --retries N       GET retries (default 1)
  --json            Machine-readable JSON output

Commands:
  auth login [--scopes SCOPE,SCOPE] | auth status | auth logout
  health | doctor [--mcp-url URL] | openapi
  cards search --query TEXT [--set CODE] [--limit N] [--all]
  cards get --id UUID
  cards prices --ids UUID,UUID
  cards history --id UUID --from DATE --to DATE [--finish all|nonfoil|foil]
  sets list [--query TEXT] [--limit N] [--all]
  predict recommendation
  predict set [--set CODE] [--target inflation|sp500|extreme] [--horizon 12|24|36]
  predict scenario --set CODE --budget EUR --risk PROFILE [--positions N]
  ml opportunities [--limit N] | ml status
  news latest | news list [--limit N] | news date --date YYYY-MM-DD
  graph neighbours [--query TEXT] [--focus UUID] [--limit N]
  alerts list | alerts set|state|delete [mutation flags]
  portfolio summary|pnl|forecast [--list UUID]
  portfolio lists | portfolio list --id UUID
  portfolio list-create|list-rename|list-delete [mutation flags]
  portfolio bulk --action move|copy|delete --ids 1,2 --source UUID
  portfolio shares --list UUID | portfolio share-create|share-revoke [mutation flags]

Mutations require --confirm and --idempotency-key. Account commands require
the documented granular scopes.
No telemetry is collected.`;

export async function run(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
) {
  const { positional, flags } = parseArgs(argv);
  if (flags.help || positional.length === 0) {
    console.log(HELP);
    return 0;
  }
  const locale = flags.locale ?? env.MAGIC_BRAIN_LOCALE ?? "en";
  if (locale !== "en" && locale !== "es") {
    throw new CliError("--locale must be en or es", 2);
  }
  const baseUrl = normalizeBaseUrl(
    String(
      flags["base-url"] ??
        env.MAGIC_BRAIN_BASE_URL ??
        "https://magicbrain.es/api/v1/",
    ),
  );
  const timeoutMs = integerFlag(flags, "timeout", 10_000, 100, 120_000);
  if (positional[0] === "auth") {
    const action = positional[1];
    const result =
      action === "login"
        ? await login({
            baseUrl,
            scopes: (
              stringFlag(flags, "scopes") ?? "public:read"
            ).split(",").map((scope) => scope.trim()).filter(Boolean),
            timeoutMs,
            fetchImpl,
          })
        : action === "status"
          ? await authStatus()
          : action === "logout"
            ? await logout(fetchImpl, timeoutMs)
            : (() => {
                throw new CliError("Use auth login, auth status, or auth logout", 2);
              })();
    printResult(result, flags.json === true);
    return 0;
  }
  const configuredApiKey =
    stringFlag(flags, "api-key") ?? env.MAGIC_BRAIN_API_KEY;
  const client = new ApiClient({
    baseUrl,
    apiKey:
      configuredApiKey ??
      (await accessToken(baseUrl, fetchImpl, timeoutMs)),
    locale,
    timeoutMs,
    retries: integerFlag(flags, "retries", 1, 0, 5),
    fetchImpl,
  });

  const [command, subcommand] = positional;
  let result: unknown;
  if (command === "health") {
    result = { api: "reachable", openapi: await client.request("openapi.json") };
  } else if (command === "doctor") {
    result = await doctor(client, flags, fetchImpl, env);
  } else if (command === "openapi") {
    result = await client.request("openapi.json");
  } else if (command === "cards" && subcommand === "search") {
    result = await paginated(client, "cards", {
      q: requiredFlag(flags, "query"),
      set: stringFlag(flags, "set"),
      limit: integerFlag(flags, "limit", 20, 1, 100),
    }, flags.all === true);
  } else if (command === "cards" && subcommand === "get") {
    result = await client.request(`cards/${encodeURIComponent(requiredFlag(flags, "id"))}`);
  } else if (command === "cards" && subcommand === "prices") {
    result = await client.request("prices/latest", {
      method: "POST",
      body: { cardIds: requiredFlag(flags, "ids").split(",").filter(Boolean) },
    });
  } else if (command === "cards" && subcommand === "history") {
    result = await client.request(
      `cards/${encodeURIComponent(requiredFlag(flags, "id"))}/prices`,
      {
        query: {
          from: requiredFlag(flags, "from"),
          to: requiredFlag(flags, "to"),
          finish: stringFlag(flags, "finish") ?? "all",
        },
      },
    );
  } else if (command === "sets" && subcommand === "list") {
    result = await paginated(client, "sets", {
      q: stringFlag(flags, "query"),
      limit: integerFlag(flags, "limit", 25, 1, 100),
    }, flags.all === true);
  } else if (command === "predict" && subcommand === "recommendation") {
    result = await client.request("predict/recommendation");
  } else if (command === "predict" && subcommand === "set") {
    result = await client.request("predict/set", {
      query: {
        set: stringFlag(flags, "set"),
        target: stringFlag(flags, "target"),
        horizon: stringFlag(flags, "horizon"),
      },
    });
  } else if (command === "predict" && subcommand === "scenario") {
    result = await client.request("predict/portfolio", {
      method: "POST",
      body: {
        setCode: requiredFlag(flags, "set"),
        budget: numberFlag(flags, "budget"),
        risk: requiredFlag(flags, "risk"),
        maxPositions: integerFlag(flags, "positions", 8, 1, 20),
      },
    });
  } else if (command === "ml" && ["opportunities", "status"].includes(subcommand)) {
    result = await client.request("ml/opportunities", {
      query: {
        limit:
          subcommand === "status"
            ? 1
            : integerFlag(flags, "limit", 10, 1, 25),
      },
    });
  } else if (command === "news" && subcommand === "latest") {
    result = await client.request("news/latest");
  } else if (command === "news" && subcommand === "list") {
    result = await client.request("news", {
      query: { limit: integerFlag(flags, "limit", 10, 1, 30) },
    });
  } else if (command === "news" && subcommand === "date") {
    result = await client.request(`news/${encodeURIComponent(requiredFlag(flags, "date"))}`);
  } else if (command === "graph" && subcommand === "neighbours") {
    result = await client.request("opportunity-graph", {
      query: {
        q: stringFlag(flags, "query"),
        focus: stringFlag(flags, "focus"),
        limit: integerFlag(flags, "limit", 48, 12, 80),
      },
    });
  } else if (command === "alerts" && subcommand === "list") {
    result = await client.request("alerts");
  } else if (command === "alerts" && subcommand === "set") {
    result = await client.request("alerts", {
      method: "POST",
      body: {
        cardId: requiredFlag(flags, "card"),
        ...(stringFlag(flags, "below-price") !== undefined
          ? { targetPrice: optionalNumberFlag(flags, "below-price") }
          : {}),
        ...(flags["below-enabled"] === true
          || flags["below-disabled"] === true
          ? { alertBelowEnabled: alertEnabled(flags, "below") }
          : {}),
        ...(stringFlag(flags, "above-price") !== undefined
          ? { alertAbovePrice: optionalNumberFlag(flags, "above-price") }
          : {}),
        ...(flags["above-enabled"] === true
          || flags["above-disabled"] === true
          ? { alertAboveEnabled: alertEnabled(flags, "above") }
          : {}),
        confirm: confirmMutation(flags),
      },
      idempotencyKey: requiredFlag(flags, "idempotency-key"),
    });
  } else if (command === "alerts" && subcommand === "state") {
    result = await client.request("alerts", {
      method: "PATCH",
      body: {
        cardId: requiredFlag(flags, "card"),
        direction: requiredFlag(flags, "direction"),
        action: requiredFlag(flags, "action"),
        confirm: confirmMutation(flags),
      },
      idempotencyKey: requiredFlag(flags, "idempotency-key"),
    });
  } else if (command === "alerts" && subcommand === "delete") {
    result = await client.request("alerts", {
      method: "DELETE",
      body: {
        cardId: requiredFlag(flags, "card"),
        confirm: confirmMutation(flags),
      },
      idempotencyKey: requiredFlag(flags, "idempotency-key"),
    });
  } else if (command === "portfolio" && ["summary", "pnl", "forecast"].includes(subcommand)) {
    const response = (await client.request("portfolio", {
      query: { list: stringFlag(flags, "list") },
    })) as Envelope;
    const portfolio = response.data as Record<string, unknown>;
    result = {
      ...response,
      data:
        subcommand === "summary"
          ? {
              asOf: portfolio.asOf,
              currency: portfolio.currency,
              summary: portfolio.summary,
              concentration: portfolio.concentration,
            }
          : subcommand === "pnl"
            ? {
                asOf: portfolio.asOf,
                currency: portfolio.currency,
                summary: portfolio.summary,
                contributors: portfolio.contributors,
              }
            : portfolio.forecast,
    };
  } else if (command === "portfolio" && subcommand === "lists") {
    result = await client.request("portfolio/lists");
  } else if (command === "portfolio" && subcommand === "list") {
    result = await client.request(
      `portfolio/lists/${encodeURIComponent(requiredFlag(flags, "id"))}`,
    );
  } else if (command === "portfolio" && subcommand === "list-create") {
    result = await client.request("portfolio/lists", {
      method: "POST",
      body: {
        name: requiredFlag(flags, "name"),
        confirm: confirmMutation(flags),
      },
      idempotencyKey: requiredFlag(flags, "idempotency-key"),
    });
  } else if (command === "portfolio" && subcommand === "list-rename") {
    result = await client.request(
      `portfolio/lists/${encodeURIComponent(requiredFlag(flags, "id"))}`,
      {
        method: "PATCH",
        body: {
          name: requiredFlag(flags, "name"),
          confirm: confirmMutation(flags),
        },
        idempotencyKey: requiredFlag(flags, "idempotency-key"),
      },
    );
  } else if (command === "portfolio" && subcommand === "list-delete") {
    result = await client.request(
      `portfolio/lists/${encodeURIComponent(requiredFlag(flags, "id"))}`,
      {
        method: "DELETE",
        body: {
          destinationListId: stringFlag(flags, "destination"),
          confirm: confirmMutation(flags),
        },
        idempotencyKey: requiredFlag(flags, "idempotency-key"),
      },
    );
  } else if (command === "portfolio" && subcommand === "bulk") {
    result = await client.request("portfolio/bulk", {
      method: "POST",
      body: {
        action: requiredFlag(flags, "action"),
        holdingIds: requiredFlag(flags, "ids")
          .split(",")
          .map((id) => Number(id)),
        sourceListId: requiredFlag(flags, "source"),
        destinationListId: stringFlag(flags, "destination"),
        confirm: confirmMutation(flags),
      },
      idempotencyKey: requiredFlag(flags, "idempotency-key"),
    });
  } else if (command === "portfolio" && subcommand === "shares") {
    result = await client.request(
      `portfolio/lists/${encodeURIComponent(requiredFlag(flags, "list"))}/shares`,
    );
  } else if (command === "portfolio" && subcommand === "share-create") {
    result = await client.request(
      `portfolio/lists/${encodeURIComponent(requiredFlag(flags, "list"))}/shares`,
      {
        method: "POST",
        body: { confirm: confirmMutation(flags) },
        idempotencyKey: requiredFlag(flags, "idempotency-key"),
      },
    );
  } else if (command === "portfolio" && subcommand === "share-revoke") {
    result = await client.request(
      `portfolio/lists/${encodeURIComponent(requiredFlag(flags, "list"))}/shares/${encodeURIComponent(requiredFlag(flags, "share"))}`,
      {
        method: "DELETE",
        body: { confirm: confirmMutation(flags) },
        idempotencyKey: requiredFlag(flags, "idempotency-key"),
      },
    );
  } else {
    throw new CliError(`Unknown command. Run magic-brain --help.\n${positional.join(" ")}`, 2);
  }
  printResult(result, flags.json === true);
  if (
    command === "doctor" &&
    typeof result === "object" &&
    result !== null &&
    (result as { status?: string }).status !== "ok"
  ) {
    const authOk = (
      (result as { checks?: { auth?: { ok?: boolean } } }).checks?.auth
    )?.ok;
    return authOk === false ? 3 : 4;
  }
  return 0;
}

async function doctor(
  client: ApiClient,
  flags: Flags,
  fetchImpl: typeof fetch,
  env: NodeJS.ProcessEnv,
) {
  const checks: Record<string, unknown> = {};
  const openapi = (await client.request("openapi.json")) as {
    openapi?: string;
    info?: { version?: string };
    paths?: Record<string, unknown>;
  };
  const required = [
    "/cards",
    "/ml/opportunities",
    "/opportunity-graph",
    "/portfolio",
    "/predict/recommendation",
  ];
  const missing = required.filter((path) => !openapi.paths?.[path]);
  checks.api = { ok: true };
  checks.openapi = {
    ok: openapi.openapi === "3.1.0" && missing.length === 0,
    version: openapi.info?.version,
    missingPaths: missing,
  };
  try {
    const status = (await client.request("ml/opportunities", {
      query: { limit: 1 },
    })) as Envelope;
    const data = status.data as Record<string, unknown>;
    checks.auth = { ok: true, requiredScope: "profile:read" };
    checks.model = { ok: true, ranking: data.ranking, safety: data.safety };
  } catch (error) {
    checks.auth = {
      ok: false,
      message: error instanceof Error ? error.message : "Auth check failed",
    };
    checks.model = { ok: false, reason: "account_status_unavailable" };
  }
  const mcpUrl =
    stringFlag(flags, "mcp-url") ??
    env.MAGIC_BRAIN_MCP_HEALTH_URL ??
    "https://magic-brain-mcp.assarasua.workers.dev/healthz";
  try {
    const response = await fetchImpl(mcpUrl, {
      signal: AbortSignal.timeout(5_000),
    });
    checks.mcp = { ok: response.ok, status: response.status, url: mcpUrl };
  } catch {
    checks.mcp = {
      ok: false,
      url: mcpUrl,
      message: "MCP health endpoint unreachable",
    };
  }
  return {
    status:
      Object.values(checks).some(
        (value) =>
          typeof value === "object" &&
          value !== null &&
          (value as { ok?: unknown }).ok === false,
      )
        ? "degraded"
        : "ok",
    checks,
  };
}

async function paginated(
  client: ApiClient,
  path: string,
  query: Record<string, string | number | boolean | undefined>,
  all: boolean,
) {
  if (!all) return client.request(path, { query });
  const pages: unknown[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    const response = (await client.request(path, {
      query: { ...query, cursor },
    })) as Envelope;
    pages.push(response.data);
    cursor = response.meta?.pagination?.nextCursor ?? undefined;
    if (!cursor) break;
  }
  return { data: pages, meta: { pages: pages.length, truncated: Boolean(cursor) } };
}

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  const flags: Flags = {};
  const booleanFlags = new Set([
    "all",
    "above-enabled",
    "above-disabled",
    "below-enabled",
    "below-disabled",
    "confirm",
    "help",
    "json",
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }
    const [rawName, inline] = token.slice(2).split("=", 2);
    if (inline !== undefined) {
      flags[rawName] = inline;
    } else if (
      !booleanFlags.has(rawName) &&
      argv[index + 1] &&
      !argv[index + 1].startsWith("--")
    ) {
      flags[rawName] = argv[++index];
    } else {
      flags[rawName] = true;
    }
  }
  return { positional, flags };
}

function stringFlag(flags: Flags, name: string) {
  const value = flags[name];
  return typeof value === "string" ? value : undefined;
}

function requiredFlag(flags: Flags, name: string) {
  const value = stringFlag(flags, name);
  if (!value) throw new CliError(`--${name} is required`, 2);
  return value;
}

function confirmMutation(flags: Flags) {
  if (flags.confirm !== true) {
    throw new CliError(
      "This account mutation requires the explicit --confirm flag.",
      2,
    );
  }
  return true;
}

function numberFlag(flags: Flags, name: string) {
  const value = Number(requiredFlag(flags, name));
  if (!Number.isFinite(value)) throw new CliError(`--${name} must be a number`, 2);
  return value;
}

function optionalNumberFlag(flags: Flags, name: string) {
  const value = stringFlag(flags, name);
  if (value === undefined) return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new CliError(`--${name} must be a non-negative number`, 2);
  }
  return number;
}

function alertEnabled(flags: Flags, direction: "above" | "below") {
  if (
    flags[`${direction}-enabled`] === true &&
    flags[`${direction}-disabled`] === true
  ) {
    throw new CliError(
      `Use only --${direction}-enabled or --${direction}-disabled`,
      2,
    );
  }
  return flags[`${direction}-enabled`] === true;
}

function integerFlag(
  flags: Flags,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const raw = stringFlag(flags, name);
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new CliError(`--${name} must be an integer from ${minimum} to ${maximum}`, 2);
  }
  return value;
}

function printResult(value: unknown, json: boolean) {
  if (json) {
    process.stdout.write(`${JSON.stringify(value)}\n`);
    return;
  }
  console.log(JSON.stringify(value, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      const exitCode = error instanceof CliError ? error.exitCode : 4;
      console.error(error instanceof Error ? error.message : "Unexpected error");
      process.exitCode = exitCode;
    });
}
