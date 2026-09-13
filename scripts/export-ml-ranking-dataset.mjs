import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not configured");
}

const outputIndex = process.argv.indexOf("--output");
const outputPath = path.resolve(
  process.cwd(),
  outputIndex >= 0
    ? process.argv[outputIndex + 1]
    : "artifacts/ml-ranking/real-dataset.json",
);
const { Client } = pg;
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  const { rows } = await client.query(`
    select
      features.scryfall_id::text as "scryfallId",
      features.as_of_date::text as "asOfDate",
      features.price_source as "priceSource",
      features.feature_contract_version as "featureContractVersion",
      labels.label_contract_version as "labelContractVersion",
      features.metadata_available_at::text as "metadataAvailableAt",
      features.source_max_price_date::text as "sourceMaxPriceDate",
      features.price_eur::float8 as "priceEur",
      features.momentum_7d::float8 as "momentum7d",
      features.momentum_30d::float8 as "momentum30d",
      features.momentum_90d::float8 as "momentum90d",
      features.volatility_30d::float8 as "volatility30d",
      features.drawdown_90d::float8 as "drawdown90d",
      features.history_days as "historyDays",
      features.observations_90d as "observations90d",
      features.price_staleness_days as "priceStalenessDays",
      features.card_age_days as "cardAgeDays",
      features.rarity,
      features.card_type as "cardType",
      features.is_reserved as "isReserved",
      labels.label_cutoff_date::text as "labelCutoffDate",
      labels.return_7d::float8 as "return7d",
      labels.return_30d::float8 as "return30d",
      labels.return_90d::float8 as "return90d",
      labels.downside_90d::float8 as "downside90d",
      labels.realized_volatility_90d::float8 as "realizedVolatility90d",
      labels.has_7d_price as "has7dPrice",
      labels.has_30d_price as "has30dPrice",
      labels.has_90d_price as "has90dPrice"
    from app_ml_feature_snapshots features
    join app_ml_outcome_labels labels
      on labels.feature_snapshot_id = features.id
      and labels.as_of_date = features.as_of_date
    where features.feature_contract_version = 'v1'
      and labels.label_contract_version = 'v1'
    order by features.as_of_date, features.scryfall_id, features.price_source
  `);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(rows, null, 2)}\n`, {
    mode: 0o600,
  });
  console.log(`Exported ${rows.length} point-in-time rows to ${outputPath}`);
} finally {
  await client.end();
}
