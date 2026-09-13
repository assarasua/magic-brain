import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildUserScores,
  isExperimentMember,
  persistUserScores,
  SCORE_UPSERT_SQL,
  selectServingMode,
  verifyModelPackage,
  verifyPromotionEvaluation,
} from "../scripts/ml-serving-core.mjs";
import { buildSyntheticRankingFixture } from "./fixtures/ml-ranking-synthetic.mjs";

const artifactUrl = new URL(
  "../artifacts/ml-ranking/ranking-logistic-v1-baefdf1ff3c3.json",
  import.meta.url,
);
const metadataUrl = new URL(
  "../artifacts/ml-ranking/ranking-logistic-v1-baefdf1ff3c3.metadata.json",
  import.meta.url,
);

async function modelPackage(status = "ready") {
  const artifactBytes = await readFile(artifactUrl);
  const metadata = JSON.parse(await readFile(metadataUrl, "utf8"));
  return {
    artifactBytes,
    metadata: { ...metadata, status },
  };
}

test("artifact verification rejects tampering and draft activation", async () => {
  const { artifactBytes, metadata } = await modelPackage();
  const tampered = Buffer.concat([artifactBytes, Buffer.from(" ")]);
  assert.throws(
    () => verifyModelPackage(tampered, metadata),
    /SHA-256 verification failed/,
  );
  assert.throws(
    () => verifyModelPackage(artifactBytes, { ...metadata, status: "draft" }),
    /draft; ready is required/,
  );
});

test("synthetic evaluation cannot satisfy promotion verification", async () => {
  const evaluation = await readFile(
    new URL(
      "../artifacts/ml-ranking/ranking-logistic-v1-baefdf1ff3c3.evaluation.json",
      import.meta.url,
    ),
  );
  assert.throws(
    () =>
      verifyPromotionEvaluation(
        evaluation,
        "ranking-logistic-v1-baefdf1ff3c3",
      ),
    /Real-data promotion gates/,
  );
});

test("batch scoring enforces safety and produces explanations", async () => {
  const { artifactBytes, metadata } = await modelPackage();
  const artifact = verifyModelPackage(artifactBytes, metadata);
  const fixture = buildSyntheticRankingFixture().at(-1);
  const feature = {
    ...fixture,
    featureSnapshotId: "snapshot-1",
    asOfDate: fixture.asOfDate,
    setCode: "tst",
    colors: [],
    cardType: "Creature",
    releasedAt: "2010-01-01",
  };
  const user = {
    id: "user-1",
    preferences: {
      budget: 1000,
      maxCardPrice: 250,
      risk: "balanced",
      strategy: "diversified",
      marketTrend: "any",
      releaseEra: "any",
      rarities: [],
      cardTypes: [],
      setCodes: [],
      colors: [],
      reservedOnly: false,
    },
  };
  const [score] = buildUserScores(artifact, user, [feature]);
  assert.ok(score);
  assert.ok(score.confidence >= 0.6);
  assert.ok(score.featureContributions.length > 0);
  assert.deepEqual(
    buildUserScores(artifact, user, [{ ...feature, priceEur: 900 }]),
    [],
  );
});

test("serving falls back for experiment-off, missing, and stale scores", () => {
  const base = {
    enabled: true,
    userId: "8bcfd3f2-0203-4f1e-90ea-5b092299a80e",
    cohortPercent: 100,
    now: new Date("2026-09-13T12:00:00Z"),
  };
  assert.equal(
    selectServingMode({ ...base, enabled: false, scores: [] }).reason,
    "experiment_off",
  );
  assert.equal(selectServingMode({ ...base, scores: [] }).reason, "scores_missing");
  assert.equal(
    selectServingMode({
      ...base,
      scores: [{
        generatedAt: "2026-09-10T00:00:00Z",
        expiresAt: "2026-09-14T00:00:00Z",
        confidence: 0.9,
        featureContributions: [{ feature: "momentum30d" }],
      }],
    }).reason,
    "scores_stale_or_unsafe",
  );
});

test("experiment assignment is stable", () => {
  const userId = "8bcfd3f2-0203-4f1e-90ea-5b092299a80e";
  assert.equal(isExperimentMember(userId, 37), isExperimentMember(userId, 37));
});

test("replayed user score writes replace the same persisted identity", async () => {
  const client = {
    rows: new Map(),
    transaction: null,
    async query(sql, values = []) {
      const normalized = sql.trim().toLowerCase();
      if (normalized === "begin") this.transaction = new Map(this.rows);
      else if (normalized === "rollback") this.transaction = null;
      else if (normalized === "commit") {
        this.rows = this.transaction;
        this.transaction = null;
      } else if (normalized.startsWith("delete from app_ml_card_user_scores")) {
        for (const key of this.transaction.keys()) {
          if (key.startsWith(`${values[0]}|`) && key.endsWith(`|${values[1]}|${values[2]}`)) {
            this.transaction.delete(key);
          }
        }
      } else if (normalized.startsWith("insert into app_ml_card_user_scores")) {
        const key = `${values[0]}|${values[1]}|${values[2]}|${values[3]}`;
        this.transaction.set(key, values[5]);
      }
      return { rows: [], rowCount: 1 };
    },
  };
  const score = {
    userId: "user-1",
    scryfallId: "card-1",
    scoreDate: "2026-09-13",
    modelVersion: "model-1",
    featureSnapshotId: "snapshot-1",
    rankScore: 0.7,
    probabilityPositive30d: 0.7,
    expectedDownside90d: null,
    confidence: 0.8,
    relevance: 0.7,
    featureContributions: [{ feature: "momentum30d" }],
  };
  const input = {
    runId: "run-1",
    userId: score.userId,
    scoreDate: score.scoreDate,
    modelVersion: score.modelVersion,
    usersCompleted: 1,
    scoresWritten: 1,
  };
  await persistUserScores(client, { ...input, scores: [score] });
  await persistUserScores(client, {
    ...input,
    scores: [{ ...score, rankScore: 0.9 }],
  });
  assert.equal(client.rows.size, 1);
  assert.equal([...client.rows.values()][0], 0.9);
  assert.match(
    SCORE_UPSERT_SQL,
    /on conflict \(user_id, scryfall_id, score_date, model_version\) do update/i,
  );
});

test("serving migration protects promotion and run identities", async () => {
  const migration = await readFile(
    new URL("../db/015_ml_batch_serving.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /dataset_kind' = 'real'/);
  assert.match(migration, /unique \(score_date, model_version\)/);
  assert.match(migration, /checkpoint_user_id/);
});
