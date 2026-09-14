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
  repositorySlugFromPackage,
  waitForProductionMigrations,
} from "../scripts/release-migration-gate.mjs";

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

test("release gate derives the repository without GitHub-only environment variables", () => {
  assert.equal(
    repositorySlugFromPackage({
      repository: {
        type: "git",
        url: "git+https://github.com/assarasua/magic-brain.git",
      },
    }),
    "assarasua/magic-brain",
  );
});

test("Cloudflare gate does not depend on GITHUB_REPOSITORY", async () => {
  const source = await readFile(
    new URL("../scripts/wait-for-production-migrations.mjs", import.meta.url),
    "utf8",
  );
  assert.match(source, /WORKERS_CI_COMMIT_SHA/);
  assert.match(source, /WORKERS_CI_BRANCH/);
  assert.doesNotMatch(source, /GITHUB_REPOSITORY/);
});

test("connected release waits for a future migration and then deploys", async () => {
  const responses = [
    {
      check_runs: [{
        name: "production-migrations",
        head_sha: "a".repeat(40),
        status: "in_progress",
        conclusion: null,
        app: { slug: "github-actions" },
      }],
    },
    {
      check_runs: [{
        name: "production-migrations",
        head_sha: "a".repeat(40),
        status: "completed",
        conclusion: "success",
        app: { slug: "github-actions" },
      }],
    },
  ];
  const delays = [];
  await waitForProductionMigrations({
    commitSha: "a".repeat(40),
    repository: "assarasua/magic-brain",
    fetchFn: async () => ({
      ok: true,
      json: async () => responses.shift(),
    }),
    sleep: async (delay) => delays.push(delay),
    pollIntervalMs: 25,
    maxAttempts: 2,
    log: () => {},
  });
  assert.deepEqual(delays, [25]);
});

test("connected release fails closed for missing or failed migrations", async () => {
  await assert.rejects(
    waitForProductionMigrations({
      commitSha: "b".repeat(40),
      repository: "assarasua/magic-brain",
      fetchFn: async () => ({
        ok: true,
        json: async () => ({ check_runs: [] }),
      }),
      sleep: async () => {},
      maxAttempts: 1,
      log: () => {},
    }),
    /Timed out waiting/,
  );
  await assert.rejects(
    waitForProductionMigrations({
      commitSha: "c".repeat(40),
      repository: "assarasua/magic-brain",
      fetchFn: async () => ({
        ok: true,
        json: async () => ({
          check_runs: [{
            name: "production-migrations",
            head_sha: "c".repeat(40),
            status: "completed",
            conclusion: "failure",
            app: { slug: "github-actions" },
          }],
        }),
      }),
      maxAttempts: 1,
      log: () => {},
    }),
    /did not pass/,
  );
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
