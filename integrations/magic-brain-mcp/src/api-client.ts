import type { MagicBrainMcpConfig } from "./config.js";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export class MagicBrainApiError extends Error {
  constructor(
    message: string,
    readonly code:
      | "UPSTREAM_ERROR"
      | "UPSTREAM_TIMEOUT"
      | "INVALID_RESPONSE"
      | "RESPONSE_TOO_LARGE",
    readonly status?: number,
    readonly requestId?: string,
    readonly retryAfter?: string,
  ) {
    super(message);
    this.name = "MagicBrainApiError";
  }
}

type RequestOptions = {
  method?: "GET" | "POST";
  query?: Record<string, string | number | boolean | undefined>;
  body?: JsonValue;
};

export class MagicBrainApiClient {
  constructor(
    private readonly config: MagicBrainMcpConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async request(path: string, options: RequestOptions = {}): Promise<{
    data: JsonValue;
    sourceUrl: string;
    requestId?: string;
  }> {
    const url = new URL(path.replace(/^\/+/, ""), this.config.apiBaseUrl);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const headers = new Headers({
      Accept: "application/json",
      "User-Agent": "magic-brain-mcp/0.1.0",
    });
    if (options.body !== undefined) headers.set("Content-Type", "application/json");
    if (this.config.apiKey) {
      headers.set("Authorization", `Bearer ${this.config.apiKey}`);
    }

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: options.method ?? "GET",
        headers,
        ...(options.body !== undefined
          ? { body: JSON.stringify(options.body) }
          : {}),
        signal: AbortSignal.timeout(this.config.apiTimeoutMs),
      });
    } catch (error) {
      if (
        error instanceof DOMException &&
        (error.name === "TimeoutError" || error.name === "AbortError")
      ) {
        throw new MagicBrainApiError(
          `Magic Brain API timed out after ${this.config.apiTimeoutMs} ms. Try a narrower query.`,
          "UPSTREAM_TIMEOUT",
        );
      }
      throw new MagicBrainApiError(
        `Magic Brain API request failed: ${
          error instanceof Error ? error.message : "network error"
        }`,
        "UPSTREAM_ERROR",
      );
    }

    const requestId =
      response.headers.get("x-request-id") ??
      response.headers.get("request-id") ??
      undefined;
    const retryAfter = response.headers.get("retry-after") ?? undefined;
    const contentLength = Number(response.headers.get("content-length"));
    if (
      Number.isFinite(contentLength) &&
      contentLength > this.config.maxResponseBytes
    ) {
      await response.body?.cancel();
      throw new MagicBrainApiError(
        "Magic Brain API response exceeded the connector size limit. Reduce limit, identifiers, or date range.",
        "RESPONSE_TOO_LARGE",
        response.status,
        requestId,
        retryAfter,
      );
    }

    const text = await readBoundedBody(response, this.config.maxResponseBytes);
    let parsed: JsonValue;
    try {
      parsed = JSON.parse(text) as JsonValue;
    } catch {
      throw new MagicBrainApiError(
        "Magic Brain API returned invalid JSON.",
        "INVALID_RESPONSE",
        response.status,
        requestId,
        retryAfter,
      );
    }

    if (!response.ok) {
      throw new MagicBrainApiError(
        extractUpstreamMessage(parsed, response.status),
        "UPSTREAM_ERROR",
        response.status,
        requestId,
        retryAfter,
      );
    }

    return {
      data: parsed,
      sourceUrl: url.toString(),
      ...(requestId ? { requestId } : {}),
    };
  }
}

async function readBoundedBody(
  response: Response,
  maxBytes: number,
): Promise<string> {
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new MagicBrainApiError(
          "Magic Brain API response exceeded the connector size limit. Reduce limit, identifiers, or date range.",
          "RESPONSE_TOO_LARGE",
          response.status,
          response.headers.get("x-request-id") ?? undefined,
          response.headers.get("retry-after") ?? undefined,
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

function extractUpstreamMessage(data: JsonValue, status: number): string {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const nestedError = data.error;
    if (
      nestedError &&
      typeof nestedError === "object" &&
      !Array.isArray(nestedError) &&
      typeof nestedError.message === "string" &&
      nestedError.message.length > 0
    ) {
      return `Magic Brain API returned ${status}: ${nestedError.message.slice(0, 300)}`;
    }
    for (const key of ["message", "error", "detail"]) {
      const value = data[key];
      if (typeof value === "string" && value.length > 0) {
        return `Magic Brain API returned ${status}: ${value.slice(0, 300)}`;
      }
    }
  }
  return `Magic Brain API returned HTTP ${status}.`;
}
