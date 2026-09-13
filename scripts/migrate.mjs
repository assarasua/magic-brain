import { readFile } from "node:fs/promises";
import pg from "pg";

const { Client } = pg;
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not configured");
}

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  const migrations = await Promise.all(
    [
      "001_product_tables.sql",
      "002_reserved_list.sql",
      "003_google_identity.sql",
      "004_user_plan_tier.sql",
      "005_card_discovery.sql",
      "006_product_tour.sql",
      "007_catalog_search.sql",
    ].map((file) =>
      readFile(new URL(`../db/${file}`, import.meta.url), "utf8"),
    ),
  );
  await client.query("begin");
  for (const migration of migrations) {
    await client.query(migration);
  }
  await client.query("commit");
  console.log("Product tables are ready.");
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
