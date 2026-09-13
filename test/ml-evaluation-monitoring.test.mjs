import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  calibrationReport,
  driftReport,
  engagementReport,
  promotionGates,
  rankingComparison,
  servingHealthReport,
} from "../scripts/ml-evaluation-core.mjs";

function rankingFixture() {
  return Array.from({ length: 3 }, (_, group) =>
    Array.from({ length: 12 }, (_, index) => ({
      groupKey: `model|user-${group}|2026-09-${10 + group}`,
      scryfallId: `card-${index.toString().padStart(2, "0")}`,
      modelScore: 12 - index,
      baselineScore: index,
      return30d: index < 8 ? 0.1 : -0.1,
      downside90d: index < 8 ? -0.02 : -0.2,
    })),
  ).flat();
}

test("ranking metrics compare model and baseline on identical groups", () => {
  const report = rankingComparison(rankingFixture());
  assert.equal(report.status, "available");
  assert.equal(report.groupCount, 3);
  assert.ok(report.model.precisionAt10.value > report.baseline.precisionAt10.value);
  assert.ok(report.model.ndcgAt10.value > report.baseline.ndcgAt10.value);
});

test("calibration uses deterministic bins including probability one", () => {
  const rows = [
    { probability: 0, outcome: 0 },
    { probability: 0.19, outcome: 0 },
    { probability: 0.81, outcome: 1 },
    { probability: 1, outcome: 1 },
  ];
  const report = calibrationReport(rows, { minimumSamples: 4 });
  assert.equal(report.status, "available");
  assert.equal(report.bins[0].sampleCount, 1);
  assert.equal(report.bins[1].sampleCount, 1);
  assert.equal(report.bins[8].sampleCount, 1);
  assert.equal(report.bins[9].sampleCount, 1);
  assert.equal(report.expectedCalibrationError.value, 0.095);
});

test("drift reports stable and shifted distributions", () => {
  const reference = Array.from({ length: 100 }, (_, index) => index);
  const stable = driftReport(reference, [...reference]);
  const shifted = driftReport(reference, reference.map((value) => value + 100));
  assert.equal(stable.status, "available");
  assert.equal(stable.populationStabilityIndex.value, 0);
  assert.ok(shifted.populationStabilityIndex.value > 0.2);
});

test("minimum samples and no-data are labeled explicitly", () => {
  assert.equal(calibrationReport([]).status, "unavailable");
  assert.equal(
    calibrationReport([{ probability: 0.7, outcome: 1 }]).status,
    "insufficient_data",
  );
  assert.equal(engagementReport({}).status, "unavailable");
  assert.equal(engagementReport({ impression: 10, open_details: 2 }).status, "insufficient_data");
  assert.equal(driftReport([], [1, 2]).status, "unavailable");
});

test("fallback and freshness ratios use only ML-eligible requests", () => {
  const events = [
    ...Array.from({ length: 80 }, () => ({
      cohort: "ml", source: "ml_batch", reason: null, scoreAgeHours: 12,
    })),
    ...Array.from({ length: 20 }, () => ({
      cohort: "ml", source: "deterministic", reason: "scores_missing_or_stale",
      scoreAgeHours: null,
    })),
    ...Array.from({ length: 50 }, () => ({
      cohort: "control", source: "deterministic", reason: "outside_cohort",
      scoreAgeHours: null,
    })),
  ];
  const report = servingHealthReport(events);
  assert.equal(report.status, "available");
  assert.equal(report.fallbackRatio.value, 0.2);
  assert.equal(report.freshScoreRatio.value, 1);
  assert.equal(report.fallbackReasons.scores_missing_or_stale, 20);
});

test("promotion gates remain disabled unless explicitly evaluated", () => {
  const report = {
    offlineRanking: rankingComparison(rankingFixture()),
    calibration: calibrationReport(
      Array.from({ length: 100 }, (_, index) => ({
        probability: index < 50 ? 0.1 : 0.9,
        outcome: index < 50 ? 0 : 1,
      })),
    ),
    drift: { rankScore: driftReport(
      Array.from({ length: 100 }, (_, index) => index),
      Array.from({ length: 100 }, (_, index) => index),
    ) },
    servingHealth: servingHealthReport(Array.from({ length: 100 }, () => ({
      cohort: "ml", source: "ml_batch", reason: null, scoreAgeHours: 1,
    }))),
  };
  assert.ok(promotionGates(report).gates.every((gate) => gate.status === "disabled"));
  assert.ok(promotionGates(report, true).gates.every((gate) => gate.status === "passed"));
});

test("monitoring migration is bounded and privacy-safe", async () => {
  const migration = await readFile(
    new URL("../db/017_ml_evaluation_monitoring.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /check \(cohort in \('off', 'control', 'ml'\)\)/);
  assert.match(migration, /idx_app_ml_serving_events_time_cohort/);
  assert.doesNotMatch(migration, /^\s*(?:ip_address|user_agent|payload)\s+/im);

  const reportScript = await readFile(
    new URL("../scripts/report-ml-evaluation.mjs", import.meta.url),
    "utf8",
  );
  assert.match(reportScript, /limit \$3/g);
  assert.doesNotMatch(reportScript, /console\.(?:log|error)\([^)]*DATABASE_URL/);
});
