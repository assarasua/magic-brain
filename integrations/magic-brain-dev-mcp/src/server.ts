import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { DevMcpConfig } from "./config.js";

const execFileAsync = promisify(execFile);
const operation = z.enum([
  "openapi",
  "cards_search",
  "sets_list",
  "predict_set",
  "predict_recommendation",
  "ml_opportunities",
  "market_brief_latest",
  "opportunity_graph",
  "portfolio",
]);
type Operation = z.infer<typeof operation>;

const operationPaths: Record<Operation, string> = {
  openapi: "openapi.json",
  cards_search: "cards",
  sets_list: "sets",
  predict_set: "predict/set",
  predict_recommendation: "predict/recommendation",
  ml_opportunities: "ml/opportunities",
  market_brief_latest: "news/latest",
  opportunity_graph: "opportunity-graph",
  portfolio: "portfolio",
};

const annotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;
const outputSchema = z.object({ result: z.json() });

export function createDevMcpServer(
  config: DevMcpConfig,
  fetchImpl: typeof fetch = fetch,
) {
  const server = new McpServer({
    name: "magic-brain-development",
    title: "Magic Brain Development",
    version: "0.1.0",
    description:
      "Local-only bounded contract diagnostics for Magic Brain contributors. It is separate from the public research MCP and provides no arbitrary shell, filesystem, URL, database, secret, or production-mutation access.",
  });

  server.registerTool(
    "inspect_openapi_contract",
    {
      title: "Inspect OpenAPI Contract",
      description:
        "Fetch the configured development API's OpenAPI document and summarize its version, operations, security declarations, and required platform surfaces.",
      inputSchema: z.object({}).strict(),
      outputSchema,
      annotations,
    },
    async () =>
      result(await apiRequest(config, fetchImpl, "openapi", {}), config),
  );

  server.registerTool(
    "call_allowlisted_dev_api",
    {
      title: "Call Allowlisted Development API",
      description:
        "Call one explicitly allowlisted read-only local/development API operation with bounded scalar query parameters. Arbitrary paths, methods, bodies, URLs, and mutations are not accepted.",
      inputSchema: z
        .object({
          operation,
          query: z
            .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
            .default({}),
        })
        .strict(),
      outputSchema,
      annotations: { ...annotations, openWorldHint: true },
    },
    async ({ operation: selected, query }) =>
      result(await apiRequest(config, fetchImpl, selected, query), config),
  );

  server.registerTool(
    "diagnose_dev_health",
    {
      title: "Diagnose Development API Health",
      description:
        "Check local API reachability, OpenAPI compatibility, configured authentication presence, and truthful promoted-model versus deterministic-fallback serving state.",
      inputSchema: z.object({}).strict(),
      outputSchema,
      annotations,
    },
    async () => {
      const checks: Record<string, unknown> = {};
      try {
        const document = (await apiRequest(
          config,
          fetchImpl,
          "openapi",
          {},
        )) as { openapi?: string; paths?: Record<string, unknown> };
        checks.openapi = {
          reachable: true,
          version: document.openapi,
          requiredPathsPresent: [
            "/ml/opportunities",
            "/opportunity-graph",
            "/portfolio",
            "/predict/recommendation",
          ].every((path) => Boolean(document.paths?.[path])),
        };
      } catch (error) {
        checks.openapi = { reachable: false, error: sanitizeError(error) };
      }
      try {
        const status = (await apiRequest(
          config,
          fetchImpl,
          "ml_opportunities",
          { limit: 1 },
        )) as { data?: { ranking?: unknown; safety?: unknown } };
        checks.auth = { configured: Boolean(config.apiKey), authorized: true };
        checks.model = {
          ranking: status.data?.ranking,
          safety: status.data?.safety,
        };
      } catch (error) {
        checks.auth = {
          configured: Boolean(config.apiKey),
          authorized: false,
          error: sanitizeError(error),
        };
        checks.model = { status: "unavailable" };
      }
      return result(checks, config);
    },
  );

  server.registerTool(
    "validate_migrations",
    {
      title: "Validate Migration Files",
      description:
        "Inspect only the repository db migration directory for ordered unique numeric names and flag production-destructive SQL tokens. It neither connects to a database nor applies migrations.",
      inputSchema: z.object({}).strict(),
      outputSchema,
      annotations,
    },
    async () => {
      const files = (await readdir(join(config.repoRoot, "db")))
        .filter((name) => /^\d{3}_.+\.sql$/.test(name))
        .sort();
      const numbers = files.map((name) => Number(name.slice(0, 3)));
      const duplicateNumbers = numbers.filter(
        (number, index) => numbers.indexOf(number) !== index,
      );
      const findings: Array<{ file: string; token: string }> = [];
      for (const file of files) {
        const sql = await readFile(join(config.repoRoot, "db", file), "utf8");
        for (const token of ["drop database", "drop schema", "truncate "]) {
          if (sql.toLowerCase().includes(token)) findings.push({ file, token });
        }
      }
      return result(
        {
          valid: duplicateNumbers.length === 0 && findings.length === 0,
          files,
          duplicateNumbers: [...new Set(duplicateNumbers)],
          destructiveTokenFindings: findings,
          applied: false,
        },
        config,
      );
    },
  );

  server.registerTool(
    "inspect_model_artifact_status",
    {
      title: "Inspect Model Artifact Status",
      description:
        "Read only checked-in ML metadata and evaluation manifests, returning lifecycle and provenance fields without raw model coefficients, private features, operator data, or synthetic metrics as production evidence.",
      inputSchema: z.object({}).strict(),
      outputSchema,
      annotations,
    },
    async () => {
      const directory = join(config.repoRoot, "artifacts", "ml-ranking");
      const files = (await readdir(directory)).filter((name) =>
        name.endsWith(".metadata.json"),
      );
      const artifacts = [];
      for (const file of files.slice(0, 20)) {
        const metadata = JSON.parse(
          await readFile(join(directory, file), "utf8"),
        ) as Record<string, unknown>;
        const evaluationPath = join(
          directory,
          file.replace(".metadata.json", ".evaluation.json"),
        );
        let evaluation: Record<string, unknown> | null = null;
        try {
          evaluation = JSON.parse(
            await readFile(evaluationPath, "utf8"),
          ) as Record<string, unknown>;
        } catch {
          // Missing evaluation is represented explicitly.
        }
        const promotion = evaluation?.promotion as
          | { decision?: unknown; note?: unknown }
          | undefined;
        artifacts.push({
          version: metadata.version,
          modelKind: metadata.model_kind,
          status: metadata.status,
          featureContractVersion: metadata.feature_contract_version,
          labelContractVersion: metadata.label_contract_version,
          trainingCutoffDate: metadata.training_cutoff_date,
          datasetKind: evaluation?.datasetKind ?? "unknown",
          promotionDecision: promotion?.decision ?? "not_evaluated",
          promotionNote: promotion?.note ?? null,
          servingEligible:
            metadata.status === "ready" &&
            evaluation?.datasetKind === "real" &&
            promotion?.decision === "promote",
        });
      }
      return result(
        {
          artifacts,
          notice:
            "Synthetic evaluation validates pipeline behavior only and is never production evidence.",
        },
        config,
      );
    },
  );

  server.registerTool(
    "run_bounded_contract_suite",
    {
      title: "Run Bounded Contract Suite",
      description:
        "Run one fixed repository test or typecheck command with a hard timeout and bounded sanitized output. The caller cannot provide shell text, paths, environment variables, or arbitrary arguments.",
      inputSchema: z
        .object({
          suite: z.enum([
            "root_tests",
            "root_typecheck",
            "public_mcp_tests",
            "cli_tests",
            "dev_mcp_tests",
          ]),
        })
        .strict(),
      outputSchema,
      annotations,
    },
    async ({ suite }) => {
      const commands = {
        root_tests: ["test"],
        root_typecheck: ["run", "typecheck"],
        public_mcp_tests: ["test", "--prefix", "integrations/magic-brain-mcp"],
        cli_tests: ["test", "--prefix", "tools/magic-brain-cli"],
        dev_mcp_tests: [
          "test",
          "--prefix",
          "integrations/magic-brain-dev-mcp",
        ],
      } as const;
      try {
        const { stdout, stderr } = await execFileAsync(
          "npm",
          [...commands[suite]],
          {
            cwd: config.repoRoot,
            timeout: Math.min(config.timeoutMs, 120_000),
            maxBuffer: config.maxOutputChars,
            env: {
              PATH: process.env.PATH,
              HOME: process.env.HOME,
              CI: "1",
            },
          },
        );
        return result(
          {
            suite,
            passed: true,
            output: sanitizeText(`${stdout}${stderr}`, config.maxOutputChars),
          },
          config,
        );
      } catch (error) {
        return result(
          { suite, passed: false, error: sanitizeError(error) },
          config,
        );
      }
    },
  );

  server.registerTool(
    "generate_fixture_request",
    {
      title: "Generate Fixture Request",
      description:
        "Generate a deterministic sanitized GET fixture for one allowlisted API operation. It emits a URL and headers with credential placeholders and never performs the request.",
      inputSchema: z
        .object({
          operation,
          query: z
            .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
            .default({}),
        })
        .strict(),
      outputSchema,
      annotations,
    },
    async ({ operation: selected, query }) => {
      const url = operationUrl(config, selected, query);
      return result(
        {
          method: "GET",
          url: url.toString(),
          headers: {
            Accept: "application/json",
            Authorization: "Bearer <MAGIC_BRAIN_API_KEY>",
          },
        },
        config,
      );
    },
  );

  return server;
}

async function apiRequest(
  config: DevMcpConfig,
  fetchImpl: typeof fetch,
  selected: Operation,
  query: Record<string, string | number | boolean>,
) {
  const url = operationUrl(config, selected, query);
  const headers = new Headers({ Accept: "application/json" });
  if (config.apiKey) headers.set("Authorization", `Bearer ${config.apiKey}`);
  const response = await fetchImpl(url, {
    headers,
    signal: AbortSignal.timeout(config.timeoutMs),
  });
  const text = await response.text();
  if (text.length > config.maxOutputChars) {
    throw new Error("Development API response exceeded the output bound");
  }
  if (!response.ok) throw new Error(`Development API returned HTTP ${response.status}`);
  return JSON.parse(text) as unknown;
}

function operationUrl(
  config: DevMcpConfig,
  selected: Operation,
  query: Record<string, string | number | boolean>,
) {
  const url = new URL(operationPaths[selected], config.apiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, String(value));
  }
  return url;
}

function result(value: unknown, config: DevMcpConfig) {
  const bounded = JSON.stringify({ result: value });
  if (bounded.length > config.maxOutputChars) {
    return result(
      { error: "Tool output exceeded the configured bound" },
      { ...config, maxOutputChars: Number.MAX_SAFE_INTEGER },
    );
  }
  return {
    content: [{ type: "text" as const, text: bounded }],
    structuredContent: { result: value },
  };
}

function sanitizeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Operation failed";
  return sanitizeText(message, 1_000);
}

function sanitizeText(value: string, maximum: number) {
  return value
    .replace(/mb_(?:live|test)_[A-Za-z0-9_-]+/g, "[REDACTED_API_KEY]")
    .slice(0, maximum);
}
