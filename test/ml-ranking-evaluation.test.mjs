import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  datasetVersion,
  evaluateWalkForward,
  explainPrediction,
  fitLogisticModel,
  predictProbability,
  sha256,
  trainFinalArtifact,
  validateRows,
} from "../scripts/ml-ranking-core.mjs";
import { buildSyntheticRankingFixture } from "./fixtures/ml-ranking-synthetic.mjs";

test("walk-forward folds use only labels mature by each test date", () => {
  const report = evaluateWalkForward(buildSyntheticRankingFixture());

  assert.ok(report.folds.length >= 3);
  for (const fold of report.folds) {
    assert.ok(fold.trainingMaxAsOfDate < fold.testDate);
    assert.ok(fold.trainingMaxLabelCutoffDate <= fold.testDate);
  }
  assert.equal(report.methodology.split, "expanding_walk_forward_by_as_of_date");
});

test("future rows cannot change an earlier fold", () => {
  const rows = buildSyntheticRankingFixture();
  const original = evaluateWalkForward(rows);
  const futureDate = rows.map((row) => row.asOfDate).sort().at(-1);
  const changed = rows.map((row) =>
    row.asOfDate === futureDate
      ? { ...row, momentum7d: 500, momentum30d: -500, return30d: 500 }
      : row,
  );
  const reevaluated = evaluateWalkForward(changed);

  assert.deepEqual(reevaluated.folds[0], original.folds[0]);
});

test("missing exact-date labels affect coverage instead of becoming zero returns", () => {
  const report = evaluateWalkForward(buildSyntheticRankingFixture());
  const incompleteFold = report.folds.find(
    (fold) => fold.labelCoverage30d < 1,
  );

  assert.ok(incompleteFold);
  assert.equal(incompleteFold.testRows, 18);
  assert.equal(incompleteFold.learned.evaluatedAtK, 10);
});

test("seeded model and dataset identity are reproducible and explainable", () => {
  const rows = buildSyntheticRankingFixture();
  const training = rows.filter(
    (row) => row.asOfDate < "2024-04-25" && row.return30d !== null,
  );
  const first = fitLogisticModel(training);
  const second = fitLogisticModel(training);

  assert.deepEqual(first, second);
  assert.equal(datasetVersion(rows), datasetVersion(buildSyntheticRankingFixture()));
  const probability = predictProbability(first, rows.at(-1));
  assert.ok(probability >= 0 && probability <= 1);
  const explanation = explainPrediction(first, rows.at(-1));
  assert.ok(explanation.length > 0 && explanation.length <= 10);
  assert.ok(
    explanation.every(
      (item) =>
        typeof item.feature === "string" &&
        ["positive", "negative"].includes(item.direction),
    ),
  );
});

test("final artifact remains draft-compatible and excludes immature labels", () => {
  const rows = buildSyntheticRankingFixture();
  const artifact = trainFinalArtifact(rows, "2025-04-20");

  assert.equal(artifact.featureContractVersion, "v1");
  assert.equal(artifact.labelContractVersion, "v1");
  assert.ok(artifact.trainingRows < rows.length);
});

test("checked-in registry metadata verifies the content-addressed artifact", async () => {
  const artifact = await readFile(
    new URL(
      "../artifacts/ml-ranking/ranking-logistic-v1-baefdf1ff3c3.json",
      import.meta.url,
    ),
    "utf8",
  );
  const metadata = JSON.parse(
    await readFile(
      new URL(
        "../artifacts/ml-ranking/ranking-logistic-v1-baefdf1ff3c3.metadata.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );

  assert.equal(metadata.status, "draft");
  assert.equal(metadata.feature_contract_version, "v1");
  assert.equal(metadata.label_contract_version, "v1");
  assert.equal(metadata.artifact_sha256, sha256(artifact));
});

test("contract validation rejects leaked feature timestamps", () => {
  const rows = buildSyntheticRankingFixture();
  assert.throws(
    () =>
      validateRows([
        {
          ...rows[0],
          sourceMaxPriceDate: "2023-01-02",
        },
      ]),
    /post-scoring/,
  );
});

test("database exporter is read-only and does not print the connection string", async () => {
  const exporter = await readFile(
    new URL("../scripts/export-ml-ranking-dataset.mjs", import.meta.url),
    "utf8",
  );
  assert.match(exporter, /select[\s\S]+app_ml_feature_snapshots/);
  assert.doesNotMatch(exporter, /\binsert\b|\bupdate\b|\bdelete\b/i);
  assert.doesNotMatch(exporter, /console\.log\([^)]*DATABASE_URL/);
});
