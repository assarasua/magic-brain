const MANUAL_PRODUCTION_STEPS = [
    [process.execPath, ["scripts/migrate.mjs"]],
    ["npx", ["--no-install", "opennextjs-cloudflare", "deploy"]],
];
const CONNECTED_PRODUCTION_STEPS = [
  [process.execPath, ["scripts/wait-for-production-migrations.mjs"]],
  ["npx", ["--no-install", "opennextjs-cloudflare", "deploy"]],
];
const PREVIEW_STEPS = [
  ["npx", ["--no-install", "opennextjs-cloudflare", "upload"]],
];

export function resolveDeploymentTarget(
  requestedTarget,
  {
    workersCi = process.env.WORKERS_CI,
    branch = process.env.WORKERS_CI_BRANCH,
    ci = process.env.CI,
  } = {},
) {
  if (requestedTarget === "production" || requestedTarget === "preview") {
    return requestedTarget;
  }
  if (requestedTarget !== "auto") {
    throw new Error(
      `Unknown deployment target "${requestedTarget ?? ""}". Use "production", "preview", or "auto".`,
    );
  }
  if (branch) return branch === "main" ? "production" : "preview";
  if (workersCi || ci) {
    throw new Error(
      "WORKERS_CI_BRANCH is required for automatic Workers Builds deployment selection",
    );
  }
  return "production";
}

export function getDeploymentSteps(
  target,
  { workersCi = process.env.WORKERS_CI } = {},
) {
  if (target === "production") {
    return workersCi ? CONNECTED_PRODUCTION_STEPS : MANUAL_PRODUCTION_STEPS;
  }
  if (target === "preview") return PREVIEW_STEPS;
  throw new Error(
    `Unknown deployment target "${target ?? ""}". Use "production" or "preview".`,
  );
}

const TRANSIENT_CONNECTION_CODES = new Set([
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "ENETDOWN",
  "ENETUNREACH",
  "ENOTFOUND",
  "ETIMEDOUT",
]);

export function isTransientConnectionError(error) {
  if (!error || typeof error !== "object") return false;
  if (
    "code" in error &&
    typeof error.code === "string" &&
    TRANSIENT_CONNECTION_CODES.has(error.code)
  ) {
    return true;
  }
  if (
    "errors" in error &&
    Array.isArray(error.errors) &&
    error.errors.some(isTransientConnectionError)
  ) {
    return true;
  }
  return "cause" in error && isTransientConnectionError(error.cause);
}

export async function connectWithRetry(
  createClient,
  {
    maxAttempts = 5,
    baseDelayMs = 2_000,
    sleep = (delayMs) =>
      new Promise((resolve) => setTimeout(resolve, delayMs)),
    log = console.warn,
  } = {},
) {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new RangeError("maxAttempts must be a positive integer");
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const client = createClient();
    try {
      await client.connect();
      return client;
    } catch (error) {
      await client.end().catch(() => undefined);
      if (!isTransientConnectionError(error) || attempt === maxAttempts) {
        throw error;
      }

      const delayMs = baseDelayMs * 2 ** (attempt - 1);
      const code =
        "code" in error && typeof error.code === "string"
          ? error.code
          : "transient network error";
      log(
        `Database connection failed (${code}); retrying in ${delayMs}ms ` +
          `(attempt ${attempt + 1}/${maxAttempts}).`,
      );
      await sleep(delayMs);
    }
  }

  throw new Error("Database connection retry loop ended unexpectedly");
}
