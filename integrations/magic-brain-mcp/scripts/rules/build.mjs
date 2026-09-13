#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const venv = fileURLToPath(new URL("../../.rules-venv", import.meta.url));
const python = `${venv}/bin/python`;

mkdirSync(fileURLToPath(new URL("../../rules-data", import.meta.url)), {
  recursive: true,
});

run("python3", ["-m", "venv", venv]);
run(python, [
  "-m",
  "pip",
  "install",
  "--disable-pip-version-check",
  "--require-hashes",
  "-r",
  "scripts/rules/requirements.txt",
]);
run(process.execPath, ["scripts/rules/fetch.mjs"]);
run(python, ["scripts/rules/extract.py"]);
run("npx", ["--no-install", "tsx", "scripts/rules/build-index.ts"]);

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
