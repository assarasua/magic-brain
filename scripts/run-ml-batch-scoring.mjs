import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import {
  buildUserScores,
  persistUserScores,
  verifyModelPackage,
} from "./ml-serving-core.mjs";

const { Client } = pg;
const repositoryRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const argumentValue = (name) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
};
const metadataPath = path.resolve(
  repositoryRoot,
  argumentValue("--metadata") ?? "",
);
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not configured");
if (!argumentValue("--metadata")) {
  throw new Error("--metadata is required; select one reviewed registry record");
}

const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
const artifactPath = path.resolve(repositoryRoot, metadata.artifact_uri ?? "");
const artifactsRoot = path.resolve(repositoryRoot, "artifacts") + path.sep;
if (!artifactPath.startsWith(artifactsRoot)) {
  throw new Error("Artifact URI must stay inside the repository artifacts directory");
}
const artifactBytes = await readFile(artifactPath);
const artifact = verifyModelPackage(artifactBytes, metadata, {
  requiredStatus: metadata.status,
});

const client = new Client({
  connectionString,
  ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
});
await client.connect();

const scoreDateArgument = argumentValue("--score-date");
const pageSize = Math.min(500, Math.max(1, Number(argumentValue("--page-size") ?? 100)));
let runId;
let advisoryLockName;

try {
  const registry = await client.query(
    `select version, status, feature_contract_version, label_contract_version,
            training_cutoff_date::text, artifact_uri, artifact_sha256
       from app_ml_model_versions where version = $1`,
    [metadata.version],
  );
  const registered = registry.rows[0];
  if (
    !registered ||
    registered.status !== "ready" ||
    registered.feature_contract_version !== metadata.feature_contract_version ||
    registered.label_contract_version !== metadata.label_contract_version ||
    registered.training_cutoff_date !== metadata.training_cutoff_date ||
    registered.artifact_uri !== metadata.artifact_uri ||
    registered.artifact_sha256 !== metadata.artifact_sha256
  ) {
    throw new Error("Verified artifact does not match a ready registry record");
  }

  const dateResult = await client.query(
    `select coalesce($1::date, max(as_of_date))::text as score_date,
            current_date - coalesce($1::date, max(as_of_date)) as age_days
       from app_ml_feature_snapshots
      where feature_contract_version = $2`,
    [scoreDateArgument, metadata.feature_contract_version],
  );
  const scoreDate = dateResult.rows[0]?.score_date;
  if (!scoreDate) throw new Error("No compatible feature snapshots are available");
  if (
    !scoreDateArgument &&
    (dateResult.rows[0].age_days < 0 || dateResult.rows[0].age_days > 2)
  ) {
    throw new Error("Latest compatible feature snapshot is stale");
  }
  advisoryLockName = `magic-brain:ml-score:${scoreDate}:${metadata.version}`;
  const lockResult = await client.query(
    "select pg_try_advisory_lock(hashtext($1)) as locked",
    [advisoryLockName],
  );
  if (!lockResult.rows[0]?.locked) {
    throw new Error("Another scorer owns this model and score date");
  }

  const runResult = await client.query(
    `insert into app_ml_batch_runs (score_date, model_version)
     values ($1, $2)
     on conflict (score_date, model_version) do update set
       status = case
         when app_ml_batch_runs.status = 'completed' then 'completed'
         else 'running'
       end,
       error_message = null,
       updated_at = now()
     returning id::text, status, checkpoint_user_id::text,
               users_completed, scores_written`,
    [scoreDate, metadata.version],
  );
  const run = runResult.rows[0];
  runId = run.id;
  if (run.status === "completed") {
    console.log(`Scoring already completed for ${scoreDate} and ${metadata.version}.`);
    process.exitCode = 0;
  } else {
    const featureResult = await client.query(
      `select f.id::text as "featureSnapshotId",
              f.scryfall_id::text as "scryfallId",
              f.as_of_date::text as "asOfDate",
              f.price_eur::float8 as "priceEur",
              f.momentum_7d::float8 as "momentum7d",
              f.momentum_30d::float8 as "momentum30d",
              f.momentum_90d::float8 as "momentum90d",
              f.volatility_30d::float8 as "volatility30d",
              f.drawdown_90d::float8 as "drawdown90d",
              f.history_days as "historyDays",
              f.observations_90d as "observations90d",
              f.price_staleness_days as "priceStalenessDays",
              f.card_age_days as "cardAgeDays",
              f.rarity,
              f.card_type as "cardType",
              f.is_reserved as "isReserved",
              c.set_code as "setCode",
              c.color_identity as colors,
              c.released_at::text as "releasedAt"
         from app_ml_feature_snapshots f
         join cards c on c.scryfall_id = f.scryfall_id
        where f.as_of_date = $1
          and f.feature_contract_version = $2
        order by f.scryfall_id`,
      [scoreDate, metadata.feature_contract_version],
    );
    if (!featureResult.rows.length) throw new Error("No features found for score date");

    let checkpoint = run.checkpoint_user_id;
    let usersCompleted = Number(run.users_completed);
    let scoresWritten = Number(run.scores_written);
    for (;;) {
      const users = await client.query(
        `select id::text, preferences
           from app_users
          where ($1::uuid is null or id > $1::uuid)
          order by id
          limit $2`,
        [checkpoint, pageSize],
      );
      if (!users.rows.length) break;
      for (const user of users.rows) {
        const value = user.preferences ?? {};
        const preferences = {
          budget: Number(value.defaultBudget ?? 1000),
          maxCardPrice: Number(value.maxCardPrice ?? 250),
          risk: value.risk ?? "balanced",
          strategy: value.strategy ?? "diversified",
          marketTrend: value.marketTrend ?? "any",
          releaseEra: value.releaseEra ?? "any",
          rarities: Array.isArray(value.rarities) ? value.rarities : [],
          cardTypes: Array.isArray(value.cardTypes) ? value.cardTypes : [],
          setCodes: Array.isArray(value.setCodes) ? value.setCodes : [],
          colors: Array.isArray(value.colors) ? value.colors : [],
          reservedOnly: value.reservedOnly === true,
        };
        const scores = buildUserScores(
          artifact,
          { id: user.id, preferences },
          featureResult.rows,
        );
        usersCompleted += 1;
        scoresWritten += scores.length;
        checkpoint = user.id;
        await persistUserScores(client, {
          runId,
          userId: user.id,
          scoreDate,
          modelVersion: metadata.version,
          scores,
          usersCompleted,
          scoresWritten,
        });
      }
    }
    await client.query(
      `update app_ml_batch_runs
          set status = 'completed', completed_at = now(), updated_at = now()
        where id = $1`,
      [runId],
    );
    console.log(
      `Scored ${usersCompleted} users (${scoresWritten} upserts) for ${scoreDate} with ${metadata.version}.`,
    );
  }
} catch (error) {
  if (runId) {
    await client
      .query(
        `update app_ml_batch_runs
            set status = 'failed', error_message = left($2, 500), updated_at = now()
          where id = $1`,
        [runId, error instanceof Error ? error.message : "Unknown batch failure"],
      )
      .catch(() => undefined);
  }
  throw error;
} finally {
  if (advisoryLockName) {
    await client
      .query("select pg_advisory_unlock(hashtext($1))", [advisoryLockName])
      .catch(() => undefined);
  }
  await client.end();
}
