import { resolve } from "node:path";
import pg from "pg";
import { downloadBulk, loadLocalBulk } from "./card-rules/source.mjs";
import { transformCardRules } from "./card-rules/transform.mjs";
import { importCardRules } from "./card-rules/database.mjs";

const HELP = `Import the complete Scryfall Oracle cards and rulings snapshots.

Usage:
  npm run db:sync-card-rules -- --dry-run
  npm run db:sync-card-rules
  npm run db:sync-card-rules -- --oracle-file PATH --rulings-file PATH --metadata-file PATH [--dry-run]

Options:
  --dry-run          Download/validate/count without connecting to the database.
  --cache-dir PATH   Download cache (default: data/card-rules).
  --oracle-file PATH Local JSON array, JSONL, or gzipped JSONL snapshot.
  --rulings-file PATH Local rulings snapshot in the same supported formats.
  --metadata-file PATH JSON with oracle/rulings source descriptors. Both SHA-256
                       checksums must match the original downloaded file bytes.
  --help             Show this help.

DATABASE_URL is required only for activation. Apply db/035_card_rules.sql first.
All rows are staged in one transaction; a failed import leaves the active
dataset unchanged. Prior datasets are retained for stable paginated reads.`;

function parseArguments(args) {
  const options = { dryRun: false, cacheDirectory: resolve("data/card-rules") };
  const valueFlags = new Map([
    ["--cache-dir", "cacheDirectory"], ["--oracle-file", "oracleFile"],
    ["--rulings-file", "rulingsFile"], ["--metadata-file", "metadataFile"],
  ]);
  const seen = new Set();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (seen.has(argument)) throw new Error(`Duplicate option: ${argument}`);
    seen.add(argument);
    if (argument === "--help") { options.help = true; continue; }
    if (argument === "--dry-run") { options.dryRun = true; continue; }
    const name = valueFlags.get(argument);
    if (!name) throw new Error(`Unknown option: ${argument}`);
    const value = args[++index];
    if (!value || value.startsWith("--")) throw new Error(`${argument} requires a path`);
    options[name] = resolve(value);
  }
  const local = [options.oracleFile, options.rulingsFile, options.metadataFile];
  if (local.some(Boolean) && !local.every(Boolean)) {
    throw new Error("Local imports require --oracle-file, --rulings-file, and --metadata-file together");
  }
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) { console.log(HELP); return; }
  if (!options.dryRun && !process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured; use --dry-run to validate without database access");
  const bulk = options.oracleFile
    ? await loadLocalBulk(options)
    : await downloadBulk({ ...options, onProgress: (message) => console.log(message) });
  const dataset = transformCardRules(bulk.oracleRecords, bulk.rulingRecords);
  if (options.dryRun) {
    console.log(JSON.stringify({ dryRun: true, ...dataset.counts, sources: bulk.sources, ...(bulk.files ? { files: bulk.files } : {}) }, null, 2));
    return;
  }
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    const result = await importCardRules(client, dataset, bulk.sources);
    console.log(JSON.stringify({ activated: true, ...result, sources: bulk.sources }, null, 2));
  } finally {
    await client.end().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(`Card-rules import failed: ${error instanceof Error ? error.message : "Unknown error"}`);
  process.exitCode = 1;
});
