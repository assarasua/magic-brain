import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  connectWithRetry,
  getDeploymentSteps,
  isTransientConnectionError,
  resolveDeploymentTarget,
} from "../scripts/deployment-pipeline.mjs";
import {
  waitForProductionSchema,
} from "../scripts/release-migration-gate.mjs";
import {
  signSchemaReadiness,
  verifySchemaReadinessSignature,
} from "../src/lib/schema-readiness.ts";

test("production deployment migrates before deploying", () => {
  assert.deepEqual(getDeploymentSteps("production", { workersCi: "" }), [
    [process.execPath, ["scripts/migrate.mjs"]],
    ["npx", ["--no-install", "opennextjs-cloudflare", "deploy"]],
  ]);
});

test("connected production waits for GitHub migrations without database access", () => {
  const steps = getDeploymentSteps("production", { workersCi: "1" });
  assert.deepEqual(steps, [
    [process.execPath, ["scripts/wait-for-production-migrations.mjs"]],
    ["npx", ["--no-install", "opennextjs-cloudflare", "deploy"]],
  ]);
  assert.doesNotMatch(JSON.stringify(steps), /migrate\.mjs|DATABASE_URL/);
});

test("preview deployment only uploads the built worker", () => {
  assert.deepEqual(getDeploymentSteps("preview", { workersCi: "1" }), [
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
      workersCi: "",
      branch: "",
      ci: "",
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

test("Cloudflare gate does not depend on GITHUB_REPOSITORY", async () => {
  const source = await readFile(
    new URL("../scripts/wait-for-production-migrations.mjs", import.meta.url),
    "utf8",
  );
  assert.match(source, /WORKERS_CI_COMMIT_SHA/);
  assert.match(source, /WORKERS_CI_BRANCH/);
  assert.doesNotMatch(source, /GITHUB_REPOSITORY/);
  assert.doesNotMatch(source, /DATABASE_URL/);
});

test("connected release waits for a future migration and then deploys", async () => {
  const statuses = [409, 200];
  const delays = [];
  const requests = [];
  await waitForProductionSchema({
    commitSha: "a".repeat(40),
    filename: "028_future_migration.sql",
    checksum: "b".repeat(64),
    secret: "synthetic-release-secret",
    fetchFn: async (url, options) => {
      requests.push({ url: String(url), options });
      const status = statuses.shift();
      return {
        ok: status === 200,
        status,
        json: async () => ({ ready: status === 200 }),
      };
    },
    sleep: async (delay) => delays.push(delay),
    pollIntervalMs: 25,
    maxAttempts: 2,
    log: () => {},
  });
  assert.deepEqual(delays, [25]);
  assert.equal(requests.length, 2);
  assert.match(requests[0].url, /028_future_migration\.sql/);
  assert.match(
    requests[0].options.headers["x-release-signature"],
    /^[0-9a-f]{64}$/,
  );
});

test("connected release fails closed for missing or failed migrations", async () => {
  await assert.rejects(
    waitForProductionSchema({
      commitSha: "b".repeat(40),
      filename: "028_future_migration.sql",
      checksum: "c".repeat(64),
      secret: "synthetic-release-secret",
      fetchFn: async () => ({
        ok: false,
        status: 409,
      }),
      sleep: async () => {},
      maxAttempts: 1,
      log: () => {},
    }),
    /schema was not ready/,
  );
  await assert.rejects(
    waitForProductionSchema({
      commitSha: "c".repeat(40),
      filename: "028_future_migration.sql",
      checksum: "d".repeat(64),
      secret: "synthetic-release-secret",
      fetchFn: async () => ({
        ok: false,
        status: 401,
      }),
      maxAttempts: 1,
      log: () => {},
    }),
    /HTTP 401/,
  );
});

test("schema readiness signatures bind commit, migration, checksum, and expiry", () => {
  const claim = {
    commit: "d".repeat(40),
    filename: "028_future_migration.sql",
    checksum: "e".repeat(64),
    expires: 2_000_000_000,
  };
  const signature = signSchemaReadiness("synthetic-release-secret", claim);
  assert.equal(
    verifySchemaReadinessSignature(
      "synthetic-release-secret",
      claim,
      signature,
    ),
    true,
  );
  assert.equal(
    verifySchemaReadinessSignature(
      "synthetic-release-secret",
      { ...claim, checksum: "f".repeat(64) },
      signature,
    ),
    false,
  );
});

test("runtime schema marker is authenticated and checks migration checksum", async () => {
  const route = await readFile(
    new URL("../src/app/api/internal/schema-readiness/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(route, /verifySchemaReadinessSignature/);
  assert.match(route, /x-release-signature/);
  assert.match(route, /select checksum from app_schema_migrations/);
  assert.match(route, /status: ready \? 200 : 409/);
  assert.doesNotMatch(route, /DATABASE_URL|migrationRunner|insert into/i);
});

test("unreachable production database blocks migration without a connected DB retry", async () => {
  await assert.rejects(
    connectWithRetry(
      () => ({
        connect: async () => {
          throw Object.assign(new Error("Railway DNS unavailable"), {
            code: "ENOTFOUND",
          });
        },
        end: async () => {},
      }),
      { maxAttempts: 1, sleep: async () => {}, log: () => {} },
    ),
    (error) => error.code === "ENOTFOUND",
  );
  assert.deepEqual(
    getDeploymentSteps("production", { workersCi: "1" })[0],
    [process.execPath, ["scripts/wait-for-production-migrations.mjs"]],
  );
});

test("main pushes run migrations on pinned Node before connected deployment", async () => {
  const [workflow, nodeVersion, migrationRunner] = await Promise.all([
    readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8"),
    readFile(new URL("../.node-version", import.meta.url), "utf8"),
    readFile(new URL("../scripts/migrate.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(workflow, /production-migrations:/);
  assert.match(workflow, /name: production-migrations/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /DATABASE_URL: \$\{\{ secrets\.DATABASE_URL \}\}/);
  assert.match(workflow, /node-version-file: \.node-version/);
  assert.match(workflow, /needs: checks/);
  assert.match(workflow, /npm run db:migrate/);
  assert.equal(nodeVersion.trim(), "22.22.0");
  assert.match(migrationRunner, /pg_advisory_lock/);
  assert.match(migrationRunner, /app_schema_migrations/);
  assert.match(migrationRunner, /select checksum/);
});
