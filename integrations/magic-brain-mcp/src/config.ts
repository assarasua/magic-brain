import { z } from "zod";

const integerFromEnv = (fallback: number, min: number, max: number) =>
  z.coerce.number().int().min(min).max(max).default(fallback);

const envSchema = z.object({
  MAGIC_BRAIN_API_BASE_URL: z
    .string()
    .url()
    .default("http://127.0.0.1:3000/api/v1/"),
  MAGIC_BRAIN_API_KEY: z.string().trim().min(1).optional(),
  MAGIC_BRAIN_API_TIMEOUT_MS: integerFromEnv(8_000, 500, 30_000),
  MAGIC_BRAIN_MAX_RESPONSE_BYTES: integerFromEnv(524_288, 16_384, 1_048_576),
  MAGIC_BRAIN_MAX_TOOL_CHARS: integerFromEnv(90_000, 8_192, 120_000),
  MCP_PORT: integerFromEnv(8788, 1, 65_535),
  MCP_BIND_HOST: z.string().trim().min(1).default("127.0.0.1"),
  MCP_ALLOWED_HOSTS: z.string().default("localhost,127.0.0.1,[::1]"),
  MCP_ALLOWED_ORIGINS: z.string().default(""),
});

export type MagicBrainMcpConfig = {
  apiBaseUrl: URL;
  apiKey?: string;
  apiTimeoutMs: number;
  maxResponseBytes: number;
  maxToolChars: number;
  port: number;
  bindHost: string;
  allowedHosts: string[];
  allowedOrigins: string[];
};

function splitList(value: string): string[] {
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
}

export function loadConfig(
  env: Record<string, string | undefined> = process.env,
): MagicBrainMcpConfig {
  const parsed = envSchema.parse(env);
  const apiBaseUrl = new URL(parsed.MAGIC_BRAIN_API_BASE_URL);

  if (!apiBaseUrl.pathname.endsWith("/")) {
    apiBaseUrl.pathname += "/";
  }

  if (
    apiBaseUrl.protocol !== "https:" &&
    !["localhost", "127.0.0.1", "::1"].includes(apiBaseUrl.hostname)
  ) {
    throw new Error(
      "MAGIC_BRAIN_API_BASE_URL must use HTTPS except for local development",
    );
  }

  return {
    apiBaseUrl,
    ...(parsed.MAGIC_BRAIN_API_KEY
      ? { apiKey: parsed.MAGIC_BRAIN_API_KEY }
      : {}),
    apiTimeoutMs: parsed.MAGIC_BRAIN_API_TIMEOUT_MS,
    maxResponseBytes: parsed.MAGIC_BRAIN_MAX_RESPONSE_BYTES,
    maxToolChars: parsed.MAGIC_BRAIN_MAX_TOOL_CHARS,
    port: parsed.MCP_PORT,
    bindHost: parsed.MCP_BIND_HOST,
    allowedHosts: splitList(parsed.MCP_ALLOWED_HOSTS),
    allowedOrigins: splitList(parsed.MCP_ALLOWED_ORIGINS),
  };
}
