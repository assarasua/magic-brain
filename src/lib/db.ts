import { Pool, QueryResultRow } from "pg";
import { getCloudflareContext } from "@opennextjs/cloudflare";

declare global {
  var magicBrainPool: Pool | undefined;
  interface CloudflareEnv {
    HYPERDRIVE?: {
      connectionString: string;
    };
  }
}

function databaseConnection() {
  const isCloudflare =
    typeof navigator !== "undefined" &&
    navigator.userAgent === "Cloudflare-Workers";

  if (isCloudflare) {
    const hyperdrive = getCloudflareContext().env.HYPERDRIVE;
    if (hyperdrive?.connectionString) {
      return { connectionString: hyperdrive.connectionString, hyperdrive: true };
    }
  }

  return {
    connectionString: process.env.DATABASE_URL,
    hyperdrive: false,
  };
}

function getPool() {
  if (global.magicBrainPool) return global.magicBrainPool;

  const connection = databaseConnection();
  if (!connection.connectionString) {
    throw new Error("DATABASE_URL is not configured");
  }

  const pool = new Pool({
    connectionString: connection.connectionString,
    ssl: connection.hyperdrive ? undefined : { rejectUnauthorized: false },
    max: connection.hyperdrive ? 1 : 8,
    allowExitOnIdle: true,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  global.magicBrainPool = pool;
  return pool;
}

export const db = {
  connect: () => getPool().connect(),
};

export async function query<T extends QueryResultRow>(
  text: string,
  values: unknown[] = [],
) {
  return getPool().query<T>(text, values);
}
