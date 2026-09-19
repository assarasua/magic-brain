import { randomUUID } from "node:crypto";

const MAX_BATCH_ROWS = 500;
const MAX_BATCH_BYTES = 1_048_576;

const INSERT_CARDS = `
  insert into app_oracle_cards
    (dataset_id, oracle_id, scryfall_id, name, layout, type_line, oracle_text, mana_cost, keywords, faces, source_url, search_text)
  select $1::uuid, x."oracleId"::uuid, x."scryfallId"::uuid, x.name, x.layout,
    x."typeLine", x."oracleText", x."manaCost", x.keywords, x.faces, x."sourceUrl", x."searchText"
  from jsonb_to_recordset($2::jsonb) as x(
    "oracleId" text, "scryfallId" text, name text, layout text, "typeLine" text,
    "oracleText" text, "manaCost" text, keywords text[], faces jsonb, "sourceUrl" text, "searchText" text
  )`;
const INSERT_EFFECTS = `
  insert into app_card_effects (dataset_id, oracle_id, face_index, effect_index, text)
  select $1::uuid, x."oracleId"::uuid, x."faceIndex", x."effectIndex", x.text
  from jsonb_to_recordset($2::jsonb) as x("oracleId" text, "faceIndex" integer, "effectIndex" integer, text text)`;
const INSERT_RULINGS = `
  insert into app_card_rulings (dataset_id, oracle_id, ruling_index, source, published_at, comment)
  select $1::uuid, x."oracleId"::uuid, x."rulingIndex", x.source, x."publishedAt"::date, x.comment
  from jsonb_to_recordset($2::jsonb) as x("oracleId" text, "rulingIndex" integer, source text, "publishedAt" text, comment text)`;

async function insertBatches(client, sql, datasetId, rows) {
  let batch = [];
  let bytes = 2;
  const flush = async () => {
    if (batch.length) await client.query(sql, [datasetId, `[${batch.join(",")}]`]);
    batch = [];
    bytes = 2;
  };
  for (const row of rows) {
    const json = JSON.stringify(row);
    const rowBytes = Buffer.byteLength(json) + 1;
    if (rowBytes + 2 > MAX_BATCH_BYTES) throw new Error("A card-rules record exceeds the SQL batch size limit");
    if (batch.length >= MAX_BATCH_ROWS || bytes + rowBytes > MAX_BATCH_BYTES) await flush();
    batch.push(json);
    bytes += rowBytes;
  }
  await flush();
}

/** One transaction publishes the complete snapshot and leaves prior snapshots intact. */
export async function importCardRules(client, dataset, sources, { datasetId = randomUUID() } = {}) {
  await client.query("begin");
  try {
    await client.query("set local lock_timeout = '30s'");
    await client.query("set local statement_timeout = '120s'");
    await client.query("select pg_advisory_xact_lock(hashtext('magic-brain:card-rules-import'))");
    await client.query(`
      insert into app_rules_datasets (id, oracle_source, rulings_source, card_count, effect_count, ruling_count, is_active)
      values ($1::uuid, $2::jsonb, $3::jsonb, $4, $5, $6, false)`, [
      datasetId, JSON.stringify(sources.oracle), JSON.stringify(sources.rulings),
      dataset.cards.length, dataset.effects.length, dataset.rulings.length,
    ]);
    await insertBatches(client, INSERT_CARDS, datasetId, dataset.cards);
    await insertBatches(client, INSERT_EFFECTS, datasetId, dataset.effects);
    await insertBatches(client, INSERT_RULINGS, datasetId, dataset.rulings);
    await client.query("update app_rules_datasets set is_active = false where is_active");
    await client.query("update app_rules_datasets set is_active = true where id = $1::uuid", [datasetId]);
    await client.query("commit");
    return { datasetId, ...dataset.counts };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  }
}
