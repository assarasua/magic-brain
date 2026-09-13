import { spawnSync } from "node:child_process";
import {
  getDeploymentSteps,
  resolveDeploymentTarget,
} from "./deployment-pipeline.mjs";

const env = {
  ...process.env,
  CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE:
    process.env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE ??
    process.env.DATABASE_URL,
};

const target = resolveDeploymentTarget(process.argv[2]);
const steps = getDeploymentSteps(target);

for (const [command, args] of steps) {
  const result = spawnSync(command, args, { env, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
