import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../db/014_ml_data_contract.sql", import.meta.url),
  "utf8",
);
const migrationRunner = await readFile(
  new URL("../scripts/migrate.mjs", import.meta.url),
  "utf8",
);

test("ML migration is ordered after every existing migration", () => {
  const previous = migrationRunner.indexOf('"013_preferences_onboarding.sql"');
  const current = migrationRunner.indexOf('"014_ml_data_contract.sql"');
  assert.ok(previous >= 0);
  assert.ok(current > previous);
});

test("feature and future-label storage are physically separated", () => {
  assert.match(migration, /create table if not exists app_ml_feature_snapshots/);
  assert.match(migration, /create table if not exists app_ml_outcome_labels/);
  assert.match(migration, /source_max_price_date <= as_of_date/);
  assert.match(migration, /source_min_future_date > as_of_date/);

  const featureTable = migration.slice(
    migration.indexOf("create table if not exists app_ml_feature_snapshots"),
    migration.indexOf("create table if not exists app_ml_outcome_labels"),
  );
  assert.doesNotMatch(featureTable, /return_7d|return_30d|return_90d|future_date/);
});

test("feedback and score tables enforce idempotency, privacy deletion, and feed indexes", () => {
  assert.match(
    migration,
    /constraint app_ml_feedback_idempotency unique \(user_id, client_event_id\)/,
  );
  assert.match(
    migration,
    /user_id uuid not null references app_users\(id\) on delete cascade/,
  );
  assert.match(migration, /idx_app_ml_feedback_training_time/);
  assert.match(migration, /idx_app_ml_scores_feed/);
  assert.doesNotMatch(migration, /\b(email|ip_address|user_agent)\b/);
});

test("model scores are tied to exact feature card and scoring date", () => {
  assert.match(
    migration,
    /foreign key \(\s*feature_snapshot_id, scryfall_id, score_date\s*\)/,
  );
  assert.match(
    migration,
    /references app_ml_feature_snapshots\(id, scryfall_id, as_of_date\)/,
  );
});
