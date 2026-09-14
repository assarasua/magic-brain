import { readFile } from "node:fs/promises";
import {
  repositorySlugFromPackage,
  waitForProductionMigrations,
} from "./release-migration-gate.mjs";

if (process.env.WORKERS_CI !== "1") {
  throw new Error(
    "The production migration gate is only valid inside Cloudflare Workers Builds",
  );
}
if (process.env.WORKERS_CI_BRANCH !== "main") {
  throw new Error("The production migration gate requires the main branch");
}

const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const repository = repositorySlugFromPackage(packageJson);

await waitForProductionMigrations({
  commitSha: process.env.WORKERS_CI_COMMIT_SHA,
  repository,
});
