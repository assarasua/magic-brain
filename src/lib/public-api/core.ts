export const PUBLIC_API_LIMITS = {
  anonymous: 30,
  key: 300,
} as const;

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function parseInteger(
  value: string | null,
  name: string,
  options: { defaultValue: number; min: number; max: number },
) {
  if (value === null) return options.defaultValue;
  if (!/^\d+$/.test(value)) {
    throw new ApiError(400, "invalid_parameter", `${name} must be an integer`);
  }
  const parsed = Number(value);
  if (parsed < options.min || parsed > options.max) {
    throw new ApiError(
      400,
      "invalid_parameter",
      `${name} must be between ${options.min} and ${options.max}`,
    );
  }
  return parsed;
}

export function optionalDate(value: string | null, name: string) {
  if (value === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ApiError(400, "invalid_parameter", `${name} must use YYYY-MM-DD`);
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) {
    throw new ApiError(400, "invalid_parameter", `${name} is not a valid date`);
  }
  return value;
}

export function assertDateRange(
  from: string | null,
  to: string | null,
  maxDays = 366,
) {
  if (!from || !to) return;
  const fromTime = Date.parse(`${from}T00:00:00Z`);
  const toTime = Date.parse(`${to}T00:00:00Z`);
  const days = (toTime - fromTime) / 86_400_000;
  if (days < 0 || days >= maxDays) {
    throw new ApiError(
      400,
      "invalid_date_range",
      `Date range must be ordered and no longer than ${maxDays} days`,
    );
  }
}

export function assertOnlyParameters(
  params: URLSearchParams,
  allowed: readonly string[],
) {
  const allowedSet = new Set(allowed);
  for (const key of params.keys()) {
    if (!allowedSet.has(key)) {
      throw new ApiError(400, "invalid_parameter", `Unknown parameter: ${key}`);
    }
  }
}

export function encodeCursor(value: Record<string, string>) {
  return Buffer.from(JSON.stringify({ v: 1, ...value }), "utf8").toString(
    "base64url",
  );
}

export function decodeCursor<T extends Record<string, string>>(
  cursor: string | null,
  required: readonly (keyof T)[],
): T | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as Record<string, unknown>;
    if (
      parsed.v !== 1 ||
      required.some(
        (key) => typeof parsed[String(key)] !== "string" || !parsed[String(key)],
      )
    ) {
      throw new Error("Invalid cursor payload");
    }
    return parsed as T;
  } catch {
    throw new ApiError(
      400,
      "invalid_cursor",
      "cursor is invalid or no longer supported",
    );
  }
}

type WindowEntry = { count: number; resetAt: number };

export class LocalRateLimiter {
  private readonly entries = new Map<string, WindowEntry>();
  private readonly limit: number;
  private readonly windowMs: number;

  constructor(limit: number, windowMs = 60_000) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  consume(key: string, now = Date.now()) {
    const existing = this.entries.get(key);
    const entry =
      !existing || existing.resetAt <= now
        ? { count: 0, resetAt: now + this.windowMs }
        : existing;
    entry.count += 1;
    this.entries.set(key, entry);

    if (this.entries.size > 10_000) {
      for (const [candidate, value] of this.entries) {
        if (value.resetAt <= now) this.entries.delete(candidate);
      }
    }

    return {
      success: entry.count <= this.limit,
      limit: this.limit,
      remaining: Math.max(0, this.limit - entry.count),
      retryAfter: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    };
  }
}
