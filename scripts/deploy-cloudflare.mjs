import { spawnSync } from "node:child_process";

const env = {
  ...process.env,
  CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE:
    process.env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE ??
    process.env.DATABASE_URL,
};

const steps = [
  ["npx", ["--no-install", "opennextjs-cloudflare", "build"]],
  [process.execPath, ["scripts/migrate.mjs"]],
  ["npx", ["--no-install", "opennextjs-cloudflare", "deploy"]],
];

for (const [command, args] of steps) {
  const result = spawnSync(command, args, { env, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
