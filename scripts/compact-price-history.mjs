import pg from "pg";

const args = process.argv.slice(2);
if (args.some((arg) => !["--apply", "--dry-run"].includes(arg)) || args.length > 1) {
  throw new Error("Usage: npm run db:compact-prices -- [--dry-run|--apply]");
}
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10_000,
  statement_timeout: 300_000,
  lock_timeout: 10_000,
});
try {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  await client.connect();
  if (!args.includes("--apply")) {
    const { rows } = await client.query(`select
      (current_date - 29)::text as keep_daily_from,
      min(date)::text as first_archivable_date,
      max(date)::text as last_archivable_date,
      count(*)::text as daily_rows_to_archive
      from prices where date < current_date - 29`);
    console.log(JSON.stringify({ mode: "dry-run", ...rows[0] }, null, 2));
  } else {
    const appUrl = new URL(process.env.PRICE_HISTORY_PUBLIC_URL ?? "https://magicbrain.es");
    const response = await fetch(new URL("/api/v1/openapi.json", appUrl), {
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error("Unable to verify the deployed price-history API; no rows archived");
    const contract = await response.json();
    const interval = contract.paths?.["/cards/{id}/prices"]?.get?.parameters
      ?.find((parameter) => parameter.name === "interval");
    if (!interval?.schema?.enum?.includes("monthly")) {
      throw new Error("Deploy the daily/monthly price-history release before running retention; no rows archived");
    }
    let total = 0;
    for (;;) {
      const { rows } = await client.query("select compact_price_history_batch()::text as archived");
      const archived = Number(rows[0].archived);
      if (archived === 0) break;
      total += archived;
      console.log(`Archived ${archived} daily rows (${total} this run).`);
    }
    const { rows: verification } = await client.query(`select
      (current_date - 29)::text as keep_daily_from,
      count(*) filter (where date < current_date - 29)::text as remaining_old_rows
      from prices`);
    if (Number(verification[0].remaining_old_rows) !== 0) {
      throw new Error("Retention verification found older daily rows; rerun the resumable command");
    }
    console.log(`Verified: no daily rows before ${verification[0].keep_daily_from}.`);
    console.log(`Retention complete: ${total} daily rows replaced with monthly aggregates.`);
  }
} finally {
  await client.end();
}
