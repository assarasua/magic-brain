import pg from "pg";
import {
  FEATURE_VERSION,
  LABEL_VERSION,
  buildLabels,
  checksum,
  metadataRevision,
  parseArguments,
  scoringDates,
} from "./ml-point-in-time-core.mjs";

const { Client } = pg;
const options = parseArguments(process.argv.slice(2));
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
});

function publicOptions(value) {
  const semantic = { ...value };
  delete semantic.resume;
  delete semantic.batchSize;
  delete semantic.chunkDays;
  delete semantic.maxRows;
  return semantic;
}

function rowFeature(row) {
  const decimal = (value) => value === null ? null : Number(Number(value).toFixed(8));
  return {
    featureContractVersion: FEATURE_VERSION,
    scryfallId: row.scryfall_id,
    asOfDate: row.as_of_date,
    priceSource: options.source,
    metadataAvailableAt: row.metadata_available_at,
    sourceMaxPriceDate: row.source_max_price_date,
    priceEur: Number(row.price_eur),
    momentum7d: decimal(row.momentum_7d),
    momentum30d: decimal(row.momentum_30d),
    momentum90d: decimal(row.momentum_90d),
    volatility30d: decimal(row.volatility_30d),
    drawdown90d: decimal(row.drawdown_90d),
    historyDays: Number(row.history_days),
    observations90d: Number(row.observations_90d),
    priceStalenessDays: Number(row.price_staleness_days),
    cardAgeDays: row.card_age_days === null ? null : Number(row.card_age_days),
    rarity: row.rarity,
    cardType: row.card_type,
    isReserved: row.is_reserved,
  };
}

async function insertMetadata(revisions) {
  await client.query(
    `insert into app_ml_card_metadata_revisions (
       scryfall_id, available_at, metadata_checksum, provenance,
       released_at, rarity, card_type, is_reserved
     )
     select x.scryfall_id::uuid, x.available_at::date, x.metadata_checksum,
            x.provenance, x.released_at::date, x.rarity, x.card_type, x.is_reserved
       from jsonb_to_recordset($1::jsonb) as x(
         scryfall_id text, available_at text, metadata_checksum text,
         provenance text, released_at text, rarity text, card_type text,
         is_reserved boolean
       )
     on conflict (scryfall_id, metadata_checksum) do update set
       available_at = least(
         app_ml_card_metadata_revisions.available_at,
         excluded.available_at
       )`,
    [JSON.stringify(revisions.map((revision) => ({
      scryfall_id: revision.scryfallId,
      available_at: revision.availableAt,
      metadata_checksum: revision.checksum,
      provenance: revision.provenance,
      released_at: revision.releasedAt,
      rarity: revision.rarity,
      card_type: revision.cardType,
      is_reserved: revision.isReserved,
    })))],
  );
}

async function estimate() {
  const dates = scoringDates(options.from, options.to, options.dateStepDays);
  const result = await client.query(
    `select d::date::text as date, count(distinct c.scryfall_id)::bigint as rows
       from unnest($1::date[]) d
       left join prices p
         on p.source = $2 and p.eur > 0
        and p.date between d - 90 and d
       left join cards c on c.scryfall_id = p.scryfall_id
        and (c.released_at is null or c.released_at <= d)
      group by d order by d`,
    [dates, options.source],
  );
  const total = result.rows.reduce((sum, row) => sum + Number(row.rows), 0);
  console.log(JSON.stringify({
    operation: "dry-run",
    source: options.source,
    from: options.from,
    to: options.to,
    scoringDates: dates.length,
    estimatedFeatureRows: total,
    maxRows: options.maxRows,
    withinBound: total <= options.maxRows,
  }));
  if (total > options.maxRows) process.exitCode = 2;
}

async function openRun(operation) {
  const optionsChecksum = checksum(publicOptions(options));
  if (options.resume) {
    const result = await client.query(
      `select id::text, operation, options_checksum, checkpoint,
              rows_examined::text, rows_written::text, status
         from app_ml_producer_runs where id = $1`,
      [options.resume],
    );
    const run = result.rows[0];
    if (!run || run.operation !== operation || run.options_checksum !== optionsChecksum) {
      throw new Error("Resume token does not match this operation and its options");
    }
    if (run.status === "completed") return run;
    await client.query(
      `update app_ml_producer_runs
          set status = 'running', error_message = null, updated_at = now()
        where id = $1`,
      [run.id],
    );
    return run;
  }
  const result = await client.query(
    `insert into app_ml_producer_runs (
       operation, feature_contract_version, label_contract_version,
       price_source, from_date, to_date, options_checksum
     ) values ($1,$2,$3,$4,$5,$6,$7)
     returning id::text, operation, options_checksum, checkpoint,
               rows_examined::text, rows_written::text, status`,
    [
      operation,
      FEATURE_VERSION,
      LABEL_VERSION,
      options.source,
      options.from ?? null,
      options.to ?? options.through ?? null,
      optionsChecksum,
    ],
  );
  return result.rows[0];
}

async function updateRun(run, checkpoint, examined, written, completed = false) {
  await client.query(
    `update app_ml_producer_runs
        set checkpoint = $2, rows_examined = $3, rows_written = $4,
            status = case when $5 then 'completed' else 'running' end,
            completed_at = case when $5 then now() else null end,
            updated_at = now()
      where id = $1`,
    [run.id, checkpoint, examined, written, completed],
  );
}

async function failRun(run, error) {
  await client.query(
    `update app_ml_producer_runs
        set status = 'failed', error_message = left($2, 500), updated_at = now()
      where id = $1`,
    [run.id, error instanceof Error ? error.message : "Unknown producer failure"],
  ).catch(() => undefined);
}

async function candidateCards(asOfDate, afterId) {
  return client.query(
    `select c.scryfall_id::text, min(p.date)::text as first_price_date,
            c.released_at::text, c.rarity, c.type_line as card_type,
            exists (
              select 1 from app_reserved_cards r where r.oracle_id = c.oracle_id
            ) as is_reserved
       from cards c
       join prices p on p.scryfall_id = c.scryfall_id
        and p.source = $1 and p.eur > 0 and p.date <= $2
      where ($3::uuid is null or c.scryfall_id > $3)
      group by c.scryfall_id, c.released_at, c.rarity, c.type_line, c.oracle_id
      having max(p.date) >= $2::date - 90
         and (c.released_at is null or c.released_at <= $2)
      order by c.scryfall_id
      limit $4`,
    [options.source, asOfDate, afterId, options.batchSize],
  );
}

async function computedFeatures(asOfDate, cardIds) {
  return client.query(
    `select c.scryfall_id::text,
            $1::date::text as as_of_date,
            metadata.available_at::text as metadata_available_at,
            current_price.date::text as source_max_price_date,
            current_price.eur::float8 as price_eur,
            (current_price.eur / price_7.eur - 1)::float8 as momentum_7d,
            (current_price.eur / price_30.eur - 1)::float8 as momentum_30d,
            (current_price.eur / price_90.eur - 1)::float8 as momentum_90d,
            stats.volatility_30d::float8,
            (current_price.eur / stats.peak_90d - 1)::float8 as drawdown_90d,
            (current_price.date - stats.first_price_date)::integer as history_days,
            stats.observations_90d::integer,
            ($1::date - current_price.date)::integer as price_staleness_days,
            case when metadata.released_at is null then null
                 else ($1::date - metadata.released_at)::integer end as card_age_days,
            metadata.rarity, metadata.card_type, metadata.is_reserved
       from cards c
       join lateral (
         select p.date, p.eur from prices p
          where p.scryfall_id = c.scryfall_id and p.source = $2
            and p.eur > 0 and p.date <= $1
          order by p.date desc limit 1
       ) current_price on true
       left join lateral (
         select p.eur from prices p
          where p.scryfall_id = c.scryfall_id and p.source = $2
            and p.eur > 0 and p.date <= $1::date - 7
          order by p.date desc limit 1
       ) price_7 on true
       left join lateral (
         select p.eur from prices p
          where p.scryfall_id = c.scryfall_id and p.source = $2
            and p.eur > 0 and p.date <= $1::date - 30
          order by p.date desc limit 1
       ) price_30 on true
       left join lateral (
         select p.eur from prices p
          where p.scryfall_id = c.scryfall_id and p.source = $2
            and p.eur > 0 and p.date <= $1::date - 90
          order by p.date desc limit 1
       ) price_90 on true
       join lateral (
         select
           (select min(p.date) from prices p
             where p.scryfall_id = c.scryfall_id and p.source = $2
               and p.eur > 0 and p.date <= current_price.date) as first_price_date,
           max(windowed.eur) filter (where windowed.date >= $1::date - 90) as peak_90d,
           count(*) filter (where windowed.date >= $1::date - 90) as observations_90d,
           (
             select stddev_pop(price_returns.log_return)
               from (
                 select ln(p.eur / lag(p.eur) over (order by p.date)) as log_return
                   from prices p
                  where p.scryfall_id = c.scryfall_id and p.source = $2
                    and p.eur > 0 and p.date between $1::date - 30 and $1
               ) price_returns
           ) as volatility_30d
         from (
           select p.date, p.eur,
                  ln(p.eur / lag(p.eur) over (order by p.date)) as log_return
             from prices p
            where p.scryfall_id = c.scryfall_id and p.source = $2
              and p.eur > 0 and p.date between $1::date - 90 and $1
         ) windowed
       ) stats on true
       join lateral (
         select m.available_at, m.released_at, m.rarity, m.card_type, m.is_reserved
           from app_ml_card_metadata_revisions m
          where m.scryfall_id = c.scryfall_id and m.available_at <= $1
            and (m.released_at is null or m.released_at <= $1)
          order by m.available_at desc, m.captured_at desc limit 1
       ) metadata on true
      where c.scryfall_id = any($3::uuid[])
      order by c.scryfall_id`,
    [asOfDate, options.source, cardIds],
  );
}

async function persistFeatures(features) {
  const payload = features.map((feature) => ({
    ...feature,
    producerChecksum: checksum(feature),
  }));
  const result = await client.query(
    `insert into app_ml_feature_snapshots (
       scryfall_id, as_of_date, price_source, feature_contract_version,
       metadata_available_at, source_max_price_date, price_eur,
       momentum_7d, momentum_30d, momentum_90d, volatility_30d,
       drawdown_90d, history_days, observations_90d, price_staleness_days,
       card_age_days, rarity, card_type, is_reserved, producer_checksum
     )
     select x.scryfall_id::uuid, x.as_of_date::date, x.price_source, $2,
            x.metadata_available_at::date, x.source_max_price_date::date,
            x.price_eur, x.momentum_7d, x.momentum_30d, x.momentum_90d,
            x.volatility_30d, x.drawdown_90d, x.history_days,
            x.observations_90d, x.price_staleness_days, x.card_age_days,
            x.rarity, x.card_type, x.is_reserved, x.producer_checksum
       from jsonb_to_recordset($1::jsonb) as x(
         scryfall_id text, as_of_date text, price_source text,
         metadata_available_at text, source_max_price_date text,
         price_eur numeric, momentum_7d numeric, momentum_30d numeric,
         momentum_90d numeric, volatility_30d numeric, drawdown_90d numeric,
         history_days integer, observations_90d integer,
         price_staleness_days integer, card_age_days integer, rarity text,
         card_type text, is_reserved boolean, producer_checksum text
       )
     on conflict (
       scryfall_id, as_of_date, price_source, feature_contract_version
     ) do nothing returning id`,
    [JSON.stringify(payload.map((feature) => ({
      scryfall_id: feature.scryfallId,
      as_of_date: feature.asOfDate,
      price_source: feature.priceSource,
      metadata_available_at: feature.metadataAvailableAt,
      source_max_price_date: feature.sourceMaxPriceDate,
      price_eur: feature.priceEur,
      momentum_7d: feature.momentum7d,
      momentum_30d: feature.momentum30d,
      momentum_90d: feature.momentum90d,
      volatility_30d: feature.volatility30d,
      drawdown_90d: feature.drawdown90d,
      history_days: feature.historyDays,
      observations_90d: feature.observations90d,
      price_staleness_days: feature.priceStalenessDays,
      card_age_days: feature.cardAgeDays,
      rarity: feature.rarity,
      card_type: feature.cardType,
      is_reserved: feature.isReserved,
      producer_checksum: feature.producerChecksum,
    }))), FEATURE_VERSION],
  );
  const existing = await client.query(
    `select scryfall_id::text, producer_checksum
       from app_ml_feature_snapshots
      where scryfall_id = any($1::uuid[]) and as_of_date = $2
        and price_source = $3 and feature_contract_version = $4`,
    [payload.map((feature) => feature.scryfallId), payload[0].asOfDate, options.source, FEATURE_VERSION],
  );
  const checksums = new Map(existing.rows.map((row) => [row.scryfall_id, row.producer_checksum]));
  for (const feature of payload) {
    if (checksums.get(feature.scryfallId) !== feature.producerChecksum) {
      throw new Error("Existing v1 feature differs from the reproducible producer output");
    }
  }
  return result.rowCount;
}

async function produceSnapshots(run) {
  const dates = scoringDates(options.from, options.to, options.dateStepDays);
  let examined = Number(run.rows_examined);
  let written = Number(run.rows_written);
  const resumedDate = run.checkpoint?.date ?? dates[0];
  for (let dateIndex = Math.max(0, dates.indexOf(resumedDate)); dateIndex < dates.length; dateIndex += 1) {
    const date = dates[dateIndex];
    let afterId = date === resumedDate ? (run.checkpoint?.cardId ?? null) : null;
    for (;;) {
      const candidates = await candidateCards(date, afterId);
      if (!candidates.rows.length) break;
      if (examined + candidates.rows.length > options.maxRows) {
        throw new Error(`Run reached --max-rows=${options.maxRows}; resume with a larger explicit bound`);
      }
      const revisions = [];
      const observedAt = new Date().toISOString().slice(0, 10);
      for (const row of candidates.rows) {
        const identity = { scryfallId: row.scryfall_id };
        revisions.push(metadataRevision(identity, row.first_price_date, "price_identity"));
        revisions.push(metadataRevision({
          scryfallId: row.scryfall_id,
          releasedAt: row.released_at,
          rarity: row.rarity,
          cardType: row.card_type,
          isReserved: row.is_reserved,
        }, observedAt, "catalog_observation"));
      }
      await client.query("begin");
      try {
        await insertMetadata(revisions);
        const computed = await computedFeatures(date, candidates.rows.map((row) => row.scryfall_id));
        const features = computed.rows.map(rowFeature);
        const batchWritten = await persistFeatures(features);
        examined += candidates.rows.length;
        written += batchWritten;
        afterId = candidates.rows.at(-1).scryfall_id;
        await updateRun(run, { date, cardId: afterId }, examined, written);
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    }
    const nextDate = dates[dateIndex + 1] ?? null;
    await updateRun(run, nextDate ? { date: nextDate } : { date }, examined, written);
    if ((dateIndex + 1) % options.chunkDays === 0 || !nextDate) {
      console.log(JSON.stringify({ runId: run.id, throughDate: date, rowsExamined: examined, rowsWritten: written }));
    }
  }
  await updateRun(run, { date: dates.at(-1) }, examined, written, true);
  console.log(JSON.stringify({ runId: run.id, status: "completed", rowsExamined: examined, rowsWritten: written }));
}

async function labelCandidates(afterId) {
  return client.query(
    `select f.id::text, f.scryfall_id::text, f.as_of_date::text,
            f.price_source, f.price_eur::float8,
            coalesce(
              json_agg(json_build_object(
                'date', p.date::text, 'source', p.source, 'eur', p.eur::float8
              ) order by p.date) filter (where p.date is not null),
              '[]'::json
            ) as future_prices
       from app_ml_feature_snapshots f
       left join prices p on p.scryfall_id = f.scryfall_id
        and p.source = f.price_source and p.eur > 0
        and p.date > f.as_of_date and p.date <= f.as_of_date + 90
      where f.feature_contract_version = $1 and f.price_source = $2
        and f.as_of_date + 90 <= $3
        and not exists (
          select 1 from app_ml_outcome_labels existing
           where existing.feature_snapshot_id = f.id
        )
        and ($4::uuid is null or f.id > $4)
      group by f.id
      order by f.id
      limit $5`,
    [FEATURE_VERSION, options.source, options.through, afterId, options.batchSize],
  );
}

async function persistLabels(rows) {
  const payload = rows.map((row) => {
    const feature = {
      scryfallId: row.scryfall_id,
      asOfDate: row.as_of_date,
      priceSource: row.price_source,
      priceEur: Number(row.price_eur),
    };
    const labels = buildLabels(feature, row.future_prices, options.through);
    return { featureSnapshotId: row.id, ...labels };
  });
  const result = await client.query(
    `insert into app_ml_outcome_labels (
       feature_snapshot_id, label_contract_version, as_of_date,
       source_min_future_date, source_max_future_date, label_cutoff_date,
       return_7d, return_30d, return_90d, downside_90d,
       realized_volatility_90d, has_7d_price, has_30d_price, has_90d_price,
       producer_checksum
     )
     select x.feature_snapshot_id::uuid, $2, x.as_of_date::date,
            x.source_min_future_date::date, x.source_max_future_date::date,
            x.label_cutoff_date::date, x.return_7d, x.return_30d,
            x.return_90d, x.downside_90d, x.realized_volatility_90d,
            x.has_7d_price, x.has_30d_price, x.has_90d_price,
            x.producer_checksum
       from jsonb_to_recordset($1::jsonb) as x(
         feature_snapshot_id text, as_of_date text,
         source_min_future_date text, source_max_future_date text,
         label_cutoff_date text, return_7d numeric, return_30d numeric,
         return_90d numeric, downside_90d numeric,
         realized_volatility_90d numeric, has_7d_price boolean,
         has_30d_price boolean, has_90d_price boolean, producer_checksum text
       )
     on conflict (feature_snapshot_id) do nothing returning feature_snapshot_id`,
    [JSON.stringify(payload.map((labels) => ({
      feature_snapshot_id: labels.featureSnapshotId,
      as_of_date: labels.asOfDate,
      source_min_future_date: labels.sourceMinFutureDate,
      source_max_future_date: labels.sourceMaxFutureDate,
      label_cutoff_date: labels.labelCutoffDate,
      return_7d: labels.return7d,
      return_30d: labels.return30d,
      return_90d: labels.return90d,
      downside_90d: labels.downside90d,
      realized_volatility_90d: labels.realizedVolatility90d,
      has_7d_price: labels.has7dPrice,
      has_30d_price: labels.has30dPrice,
      has_90d_price: labels.has90dPrice,
      producer_checksum: labels.producerChecksum,
    }))), LABEL_VERSION],
  );
  const existing = await client.query(
    `select feature_snapshot_id::text, producer_checksum
       from app_ml_outcome_labels
      where feature_snapshot_id = any($1::uuid[])`,
    [payload.map((labels) => labels.featureSnapshotId)],
  );
  const checksums = new Map(existing.rows.map((row) => [row.feature_snapshot_id, row.producer_checksum]));
  for (const labels of payload) {
    if (checksums.get(labels.featureSnapshotId) !== labels.producerChecksum) {
      throw new Error("Existing v1 label differs from the exact-date producer output");
    }
  }
  return result.rowCount;
}

async function matureLabels(run) {
  let examined = Number(run.rows_examined);
  let written = Number(run.rows_written);
  let afterId = run.checkpoint?.featureSnapshotId ?? null;
  for (;;) {
    const candidates = await labelCandidates(afterId);
    if (!candidates.rows.length) break;
    if (examined + candidates.rows.length > options.maxRows) {
      throw new Error(`Run reached --max-rows=${options.maxRows}; resume with a larger explicit bound`);
    }
    await client.query("begin");
    try {
      written += await persistLabels(candidates.rows);
      examined += candidates.rows.length;
      afterId = candidates.rows.at(-1).id;
      await updateRun(run, { featureSnapshotId: afterId }, examined, written);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
    console.log(JSON.stringify({ runId: run.id, throughFeatureSnapshotId: afterId, rowsExamined: examined, rowsWritten: written }));
  }
  await updateRun(run, { featureSnapshotId: afterId }, examined, written, true);
  console.log(JSON.stringify({ runId: run.id, status: "completed", rowsExamined: examined, rowsWritten: written }));
}

await client.connect();
let run;
let lockName;
try {
  if (options.command === "dry-run") {
    await estimate();
  } else {
    const operation = options.command === "daily" ? "daily" : options.command;
    lockName = `magic-brain:ml-producer:${operation}:${options.source}`;
    const lock = await client.query("select pg_try_advisory_lock(hashtext($1)) as locked", [lockName]);
    if (!lock.rows[0]?.locked) throw new Error("Another compatible ML producer is already running");
    run = await openRun(operation);
    if (run.status === "completed") {
      console.log(JSON.stringify({ runId: run.id, status: "already-completed" }));
    } else if (operation === "mature-labels") {
      await matureLabels(run);
    } else {
      await produceSnapshots(run);
    }
  }
} catch (error) {
  if (run) await failRun(run, error);
  throw error;
} finally {
  if (lockName) {
    await client.query("select pg_advisory_unlock(hashtext($1))", [lockName]).catch(() => undefined);
  }
  await client.end();
}
