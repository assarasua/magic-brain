import { spawnSync } from "node:child_process";

const env = {
  ...process.env,
  CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE:
    process.env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE ??
    process.env.DATABASE_URL,
};

for (const command of ["build", "deploy"]) {
  const result = spawnSync(
    "npx",
    ["--no-install", "opennextjs-cloudflare", command],
    { env, stdio: "inherit" },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}
