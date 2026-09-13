import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import pg from "pg";
import { connectWithRetry } from "./deployment-pipeline.mjs";

const { Client } = pg;
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not configured");
}

const client = await connectWithRetry(
  () =>
    new Client({
      connectionString,
      ssl: { rejectUnauthorized: false },
    }),
);

try {
  await client.query("select pg_advisory_lock(hashtext('magic-brain:migrations'))");
  await client.query(`
    create table if not exists app_schema_migrations (
      filename text primary key,
      checksum text not null,
      applied_at timestamptz not null default now()
    )
  `);
  const filenames = [
      "000_base_data_schema.sql",
      "001_product_tables.sql",
      "002_reserved_list.sql",
      "003_google_identity.sql",
      "004_user_plan_tier.sql",
      "005_card_discovery.sql",
      "006_product_tour.sql",
      "007_catalog_search.sql",
      "008_watchlist_price_alerts.sql",
      "009_donations.sql",
      "010_sets.sql",
      "011_public_api.sql",
      "012_market_briefs.sql",
      "013_preferences_onboarding.sql",
  ];
  let applied = 0;
  for (const filename of filenames) {
    const migration = await readFile(
      new URL(`../db/${filename}`, import.meta.url),
      "utf8",
    );
    const checksum = createHash("sha256").update(migration).digest("hex");
    const existing = await client.query(
      "select checksum from app_schema_migrations where filename = $1",
      [filename],
    );
    if (existing.rows[0]) {
      if (existing.rows[0].checksum !== checksum) {
        throw new Error(
          `Applied migration ${filename} differs from the checked-in file`,
        );
      }
      continue;
    }
    await client.query("begin");
    try {
      await client.query(migration);
      await client.query(
        "insert into app_schema_migrations (filename, checksum) values ($1, $2)",
        [filename, checksum],
      );
      await client.query("commit");
      applied += 1;
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }
  console.log(`Database is ready (${applied} migration(s) applied).`);
} finally {
  await client
    .query("select pg_advisory_unlock(hashtext('magic-brain:migrations'))")
    .catch(() => undefined);
  await client.end();
}
