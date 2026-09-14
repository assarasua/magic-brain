import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { waitForProductionSchema } from "./release-migration-gate.mjs";

if (process.env.WORKERS_CI !== "1") {
  throw new Error(
    "The production migration gate is only valid inside Cloudflare Workers Builds",
  );
}
if (process.env.WORKERS_CI_BRANCH !== "main") {
  throw new Error("The production migration gate requires the main branch");
}

const migrationRunner = await readFile(
  new URL("./migrate.mjs", import.meta.url),
  "utf8",
);
const filenames = [...migrationRunner.matchAll(/"(\d{3}_[^"]+\.sql)"/g)]
  .map((match) => match[1]);
const filename = filenames.at(-1);
if (!filename) throw new Error("At least one migration is required");
const migration = await readFile(
  new URL(`../db/${filename}`, import.meta.url),
  "utf8",
);
const checksum = createHash("sha256").update(migration).digest("hex");

await waitForProductionSchema({
  commitSha: process.env.WORKERS_CI_COMMIT_SHA,
  filename,
  checksum,
  secret: process.env.AUTH_SECRET,
});
