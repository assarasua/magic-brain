import { Pool, QueryResultRow } from "pg";

declare global {
  var magicBrainPool: Pool | undefined;
}

const connectionString = process.env.DATABASE_URL;

export const db =
  global.magicBrainPool ??
  new Pool({
    connectionString,
    ssl: connectionString ? { rejectUnauthorized: false } : undefined,
    max: 8,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

if (process.env.NODE_ENV !== "production") {
  global.magicBrainPool = db;
}

export async function query<T extends QueryResultRow>(
  text: string,
  values: unknown[] = [],
) {
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured");
  }

  return db.query<T>(text, values);
}
