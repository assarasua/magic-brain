import { fileURLToPath } from "node:url";

export type DevMcpConfig = {
  apiBaseUrl: URL;
  apiKey?: string;
  repoRoot: string;
  timeoutMs: number;
  maxOutputChars: number;
  port: number;
};

export function loadDevConfig(
  env: Record<string, string | undefined> = process.env,
): DevMcpConfig {
  const apiBaseUrl = new URL(
    env.MAGIC_BRAIN_DEV_API_BASE_URL ??
      "http://127.0.0.1:3000/api/v1/",
  );
  const local = ["localhost", "127.0.0.1", "::1"].includes(apiBaseUrl.hostname);
  if (!local && env.MAGIC_BRAIN_DEV_ALLOW_REMOTE_READONLY !== "true") {
    throw new Error(
      "Development MCP targets localhost by default; set MAGIC_BRAIN_DEV_ALLOW_REMOTE_READONLY=true for an explicit read-only remote target",
    );
  }
  if (!local && apiBaseUrl.protocol !== "https:") {
    throw new Error("Remote development MCP targets must use HTTPS");
  }
  if (!apiBaseUrl.pathname.endsWith("/")) apiBaseUrl.pathname += "/";
  return {
    apiBaseUrl,
    ...(env.MAGIC_BRAIN_API_KEY ? { apiKey: env.MAGIC_BRAIN_API_KEY } : {}),
    repoRoot:
      env.MAGIC_BRAIN_REPO_ROOT ??
      fileURLToPath(new URL("../../../", import.meta.url)),
    timeoutMs: boundedInteger(env.MAGIC_BRAIN_DEV_TIMEOUT_MS, 10_000, 500, 120_000),
    maxOutputChars: boundedInteger(
      env.MAGIC_BRAIN_DEV_MAX_OUTPUT_CHARS,
      60_000,
      4_096,
      120_000,
    ),
    port: boundedInteger(env.MCP_PORT, 8790, 1, 65_535),
  };
}

function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`Configuration integer must be ${minimum}-${maximum}`);
  }
  return parsed;
}
