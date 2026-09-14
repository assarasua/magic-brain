import { signSchemaReadiness } from "../src/lib/schema-readiness.ts";

export async function waitForProductionSchema({
  commitSha,
  filename,
  checksum,
  secret,
  baseUrl = "https://magicbrain.es",
  fetchFn = fetch,
  sleep = (delayMs) =>
    new Promise((resolve) => setTimeout(resolve, delayMs)),
  maxAttempts = 40,
  pollIntervalMs = 15_000,
  log = console.log,
}) {
  if (!/^[0-9a-f]{40}$/i.test(commitSha ?? "")) {
    throw new Error("WORKERS_CI_COMMIT_SHA must be a full Git commit SHA");
  }
  if (!/^\d{3}_[a-z0-9_]+\.sql$/.test(filename ?? "")) {
    throw new Error("A valid latest migration filename is required");
  }
  if (!/^[0-9a-f]{64}$/i.test(checksum ?? "")) {
    throw new Error("A valid latest migration checksum is required");
  }
  if (!secret) {
    throw new Error("AUTH_SECRET is required for the production schema gate");
  }
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new RangeError("maxAttempts must be a positive integer");
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const expires = Math.floor(Date.now() / 1000) + 120;
    const claim = { commit: commitSha, filename, checksum, expires };
    const endpoint = new URL("/api/internal/schema-readiness", baseUrl);
    Object.entries(claim).forEach(([key, value]) =>
      endpoint.searchParams.set(key, String(value)),
    );
    try {
      const response = await fetchFn(endpoint, {
        headers: {
          "x-release-signature": signSchemaReadiness(secret, claim),
        },
        cache: "no-store",
      });
      if (response.ok) {
        const payload = await response.json();
        if (payload.ready === true) {
          log(`Production schema includes ${filename}.`);
          return;
        }
        throw new Error("Schema readiness response was malformed");
      }
      if (![404, 409, 503].includes(response.status)) {
        throw new Error(
          `Production schema verification failed with HTTP ${response.status}`,
        );
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith("Production schema verification failed")
      ) {
        throw error;
      }
      if (attempt === maxAttempts) {
        throw new Error(
          `Production schema was not ready for ${commitSha}; deployment aborted`,
          { cause: error },
        );
      }
    }
    if (attempt === maxAttempts) break;
    log(
      `Waiting for production schema ${filename} ` +
        `(attempt ${attempt}/${maxAttempts}).`,
    );
    await sleep(pollIntervalMs);
  }
  throw new Error(
    `Production schema was not ready for ${commitSha}; deployment aborted`,
  );
}
