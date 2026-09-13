export type ClientOptions = {
  baseUrl: URL;
  apiKey?: string;
  locale: "en" | "es";
  timeoutMs: number;
  retries: number;
  fetchImpl?: typeof fetch;
};

export class CliError extends Error {
  constructor(
    message: string,
    readonly exitCode: 2 | 3 | 4,
  ) {
    super(message);
  }
}

export class ApiClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: ClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async request(
    path: string,
    input: {
      method?: "GET" | "POST" | "DELETE" | "PATCH";
      query?: Record<string, string | number | boolean | undefined>;
      body?: unknown;
      idempotencyKey?: string;
    } = {},
  ): Promise<unknown> {
    const url = new URL(path.replace(/^\/+/, ""), this.options.baseUrl);
    for (const [key, value] of Object.entries(input.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    const method = input.method ?? "GET";
    const attempts = method === "GET" ? this.options.retries + 1 : 1;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const headers = new Headers({
          Accept: "application/json",
          "Accept-Language": this.options.locale,
          "User-Agent": "magic-brain-cli/0.1.0",
        });
        if (this.options.apiKey) {
          headers.set("Authorization", `Bearer ${this.options.apiKey}`);
        }
        if (input.body !== undefined) headers.set("Content-Type", "application/json");
        if (input.idempotencyKey) {
          headers.set("Idempotency-Key", input.idempotencyKey);
        }
        const response = await this.fetchImpl(url, {
          method,
          headers,
          body:
            input.body === undefined ? undefined : JSON.stringify(input.body),
          signal: AbortSignal.timeout(this.options.timeoutMs),
        });
        const value = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        if (!response.ok) {
          const message =
            value?.error?.message ?? `API returned HTTP ${response.status}`;
          if (response.status === 401 || response.status === 403) {
            throw new CliError(message, 3);
          }
          if (response.status >= 500 && attempt + 1 < attempts) continue;
          throw new CliError(message, 4);
        }
        return value;
      } catch (error) {
        if (error instanceof CliError) throw error;
        if (attempt + 1 < attempts) continue;
        throw new CliError(
          error instanceof Error ? error.message : "Network request failed",
          4,
        );
      }
    }
    throw new CliError("Request failed", 4);
  }
}

export function normalizeBaseUrl(value: string) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new CliError("Base URL must use HTTP or HTTPS", 2);
  }
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/`;
  return url;
}
