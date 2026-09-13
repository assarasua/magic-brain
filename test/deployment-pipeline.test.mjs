import assert from "node:assert/strict";
import test from "node:test";
import {
  connectWithRetry,
  getDeploymentSteps,
  isTransientConnectionError,
  resolveDeploymentTarget,
} from "../scripts/deployment-pipeline.mjs";

test("production deployment migrates before deploying", () => {
  assert.deepEqual(getDeploymentSteps("production"), [
    [process.execPath, ["scripts/migrate.mjs"]],
    ["npx", ["--no-install", "opennextjs-cloudflare", "deploy"]],
  ]);
});

test("preview deployment only uploads the built worker", () => {
  assert.deepEqual(getDeploymentSteps("preview"), [
    ["npx", ["--no-install", "opennextjs-cloudflare", "upload"]],
  ]);
  assert.throws(() => getDeploymentSteps(), /Unknown deployment target/);
});

test("automatic selection fails closed and keeps non-main builds in preview", () => {
  assert.equal(
    resolveDeploymentTarget("auto", {
      workersCi: "1",
      branch: "feature/example",
    }),
    "preview",
  );
  assert.equal(
    resolveDeploymentTarget("auto", { workersCi: "1", branch: "main" }),
    "production",
  );
  assert.equal(
    resolveDeploymentTarget("auto", {
      workersCi: undefined,
      branch: undefined,
      ci: undefined,
    }),
    "production",
  );
  assert.throws(
    () =>
      resolveDeploymentTarget("auto", {
        workersCi: "1",
        branch: undefined,
      }),
    /WORKERS_CI_BRANCH is required/,
  );
});

test("only transport and DNS failures are retryable", () => {
  assert.equal(isTransientConnectionError({ code: "ENOTFOUND" }), true);
  assert.equal(
    isTransientConnectionError({
      errors: [{ code: "ECONNREFUSED" }, { code: "ENETUNREACH" }],
    }),
    true,
  );
  assert.equal(isTransientConnectionError({ code: "28P01" }), false);
  assert.equal(isTransientConnectionError(new Error("schema mismatch")), false);
});

test("database connection retries with bounded exponential backoff", async () => {
  const delays = [];
  let attempts = 0;
  const connectedClient = await connectWithRetry(
    () => ({
      connect: async () => {
        attempts += 1;
        if (attempts < 3) {
          throw Object.assign(new Error("temporary DNS failure"), {
            code: "ENOTFOUND",
          });
        }
      },
      end: async () => {},
    }),
    {
      maxAttempts: 4,
      baseDelayMs: 10,
      sleep: async (delayMs) => delays.push(delayMs),
      log: () => {},
    },
  );

  assert.equal(typeof connectedClient.connect, "function");
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [10, 20]);
});

test("database connection does not retry authentication failures", async () => {
  let attempts = 0;
  await assert.rejects(
    connectWithRetry(
      () => ({
        connect: async () => {
          attempts += 1;
          throw Object.assign(new Error("authentication failed"), {
            code: "28P01",
          });
        },
        end: async () => {},
      }),
      { sleep: async () => {}, log: () => {} },
    ),
    (error) => error.code === "28P01",
  );
  assert.equal(attempts, 1);
});
