import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import {
  EVALUATION_POLICY,
  availability,
  calibrationReport,
  driftReport,
  engagementReport,
  promotionGates,
  rankingComparison,
  servingHealthReport,
} from "./ml-evaluation-core.mjs";
import { deterministicScore } from "./ml-ranking-core.mjs";

const argumentValue = (name) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
};
const hasFlag = (name) => process.argv.includes(name);
const assertDate = (value, name) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? "") ||
      new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) {
    throw new Error(`${name} must be an ISO calendar date`);
  }
  return value;
};
const addDays = (date, days) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000)
    .toISOString().slice(0, 10);

const asOfDate = assertDate(
  argumentValue("--as-of") ?? new Date().toISOString().slice(0, 10),
  "--as-of",
);
const windowDays = Number(argumentValue("--window-days") ?? 30);
const baselineDays = Number(argumentValue("--baseline-days") ?? 30);
const maxRows = Number(argumentValue("--max-rows") ?? EVALUATION_POLICY.maximumQueryRows);
if (!Number.isInteger(windowDays) || windowDays < 1 ||
    windowDays > EVALUATION_POLICY.maximumReportWindowDays) {
  throw new Error(`--window-days must be 1-${EVALUATION_POLICY.maximumReportWindowDays}`);
}
if (!Number.isInteger(baselineDays) || baselineDays < 1 ||
    baselineDays > EVALUATION_POLICY.maximumReportWindowDays) {
  throw new Error(`--baseline-days must be 1-${EVALUATION_POLICY.maximumReportWindowDays}`);
}
if (!Number.isInteger(maxRows) || maxRows < 1 ||
    maxRows > EVALUATION_POLICY.maximumQueryRows) {
  throw new Error(`--max-rows must be 1-${EVALUATION_POLICY.maximumQueryRows}`);
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
const fromDate = addDays(asOfDate, -(windowDays - 1));
const baselineToDate = addDays(fromDate, -1);
const baselineFromDate = addDays(baselineToDate, -(baselineDays - 1));
const outputPath = argumentValue("--output")
  ? path.resolve(process.cwd(), argumentValue("--output"))
  : null;
const evaluationPath = argumentValue("--evaluation")
  ? path.resolve(process.cwd(), argumentValue("--evaluation"))
  : null;
let offlineEvaluation = null;
if (evaluationPath) {
  const value = JSON.parse(await readFile(evaluationPath, "utf8"));
  if (value.schemaVersion !== "ml-ranking-evaluation-v1" ||
      !value.modelVersion ||
      !value.evaluation?.aggregate) {
    throw new Error("--evaluation must be a versioned ML ranking evaluation");
  }
  const aggregate = value.evaluation.aggregate;
  const sampleCount = aggregate.foldCount ?? 0;
  const metric = (side, name) =>
    availability(aggregate[side]?.[name] ?? null, sampleCount, 3);
  offlineEvaluation = {
    datasetKind: value.datasetKind,
    datasetVersion: value.datasetVersion,
    modelVersion: value.modelVersion,
    featureContractVersion: value.featureContractVersion,
    labelContractVersion: value.labelContractVersion,
    status: value.datasetKind === "real" ? "available" : "not_eligible",
    groupCount: sampleCount,
    minimumGroups: 3,
    model: {
      precisionAt10: metric("learned", "precisionAt10"),
      ndcgAt10: metric("learned", "ndcgAt10"),
      hitRate: metric("learned", "hitRate"),
      downsideRate: metric("learned", "downsideRate"),
      labelCoverage: availability(aggregate.labelCoverage30d ?? null, sampleCount, 3),
      meanNetReturn30d: metric("learned", "meanNetReturn30d"),
    },
    baseline: {
      precisionAt10: metric("deterministic", "precisionAt10"),
      ndcgAt10: metric("deterministic", "ndcgAt10"),
      hitRate: metric("deterministic", "hitRate"),
      downsideRate: metric("deterministic", "downsideRate"),
      labelCoverage: availability(aggregate.labelCoverage30d ?? null, sampleCount, 3),
      meanNetReturn30d: metric("deterministic", "meanNetReturn30d"),
    },
  };
}

const { Client } = pg;
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
});
await client.connect();
try {
  const scoreResult = await client.query(
    `select scores.user_id::text as "userId",
            scores.scryfall_id::text as "scryfallId",
            scores.score_date::text as "scoreDate",
            scores.model_version as "modelVersion",
            scores.rank_score::float8 as "modelScore",
            scores.probability_positive_30d::float8 as probability,
            features.momentum_7d::float8 as "momentum7d",
            features.momentum_30d::float8 as "momentum30d",
            labels.return_30d::float8 as "return30d",
            labels.downside_90d::float8 as "downside90d"
       from app_ml_card_user_scores scores
       join app_ml_feature_snapshots features
         on features.id = scores.feature_snapshot_id
       left join app_ml_outcome_labels labels
         on labels.feature_snapshot_id = scores.feature_snapshot_id
        and labels.label_cutoff_date <= $2::date
      where scores.score_date between $1::date and $2::date
      order by scores.score_date, scores.model_version, scores.user_id,
               scores.rank_score desc, scores.scryfall_id
      limit $3`,
    [fromDate, asOfDate, maxRows],
  );
  const scored = scoreResult.rows.map((row) => ({
    ...row,
    groupKey: `${row.modelVersion}|${row.userId}|${row.scoreDate}`,
    baselineScore: deterministicScore(row),
    outcome: Number.isFinite(row.return30d) ? (row.return30d > 0 ? 1 : 0) : null,
  }));

  const driftScores = await client.query(
    `select scores.model_version as "modelVersion",
            scores.score_date::text as "scoreDate",
            rank_score::float8 as "rankScore",
            confidence::float8 as confidence,
            features.momentum_7d::float8 as "momentum7d",
            features.momentum_30d::float8 as "momentum30d",
            features.volatility_30d::float8 as "volatility30d",
            features.price_staleness_days::float8 as "priceStalenessDays"
       from app_ml_card_user_scores scores
       join app_ml_feature_snapshots features
         on features.id = scores.feature_snapshot_id
      where scores.score_date between $1::date and $2::date
      order by scores.model_version, scores.score_date, scores.user_id,
               scores.scryfall_id
      limit $3`,
    [baselineFromDate, asOfDate, maxRows],
  );
  const feedback = await client.query(
    `select coalesce(model_version, 'deterministic_unattributed') as cohort,
            event_type as "eventType", count(*)::int as count
       from app_ml_feedback_events
      where occurred_at >= $1::date
        and occurred_at < ($2::date + 1)
      group by coalesce(model_version, 'deterministic_unattributed'), event_type
      order by cohort, event_type`,
    [fromDate, asOfDate],
  );
  const serving = await client.query(
    `select cohort, source, fallback_reason as reason,
            case when score_generated_at is null then null
                 else extract(epoch from (served_at - score_generated_at)) / 3600
             end::float8 as "scoreAgeHours"
       from app_ml_serving_events
      where served_at >= $1::date
        and served_at < ($2::date + 1)
      order by served_at
      limit $3`,
    [fromDate, asOfDate, maxRows],
  );

  const modelVersions = [...new Set(scored.map((row) => row.modelVersion))].sort();
  const offlineByModel = Object.fromEntries(modelVersions.map((version) => [
    version,
    rankingComparison(scored.filter((row) => row.modelVersion === version)),
  ]));
  const calibrationByModel = Object.fromEntries(modelVersions.map((version) => [
    version,
    calibrationReport(scored.filter((row) => row.modelVersion === version)),
  ]));
  const feedbackCounts = {};
  for (const row of feedback.rows) {
    feedbackCounts[row.cohort] ??= {};
    feedbackCounts[row.cohort][row.eventType] = row.count;
  }
  const engagementByCohort = Object.fromEntries(
    Object.entries(feedbackCounts).map(([cohort, counts]) => [
      cohort,
      engagementReport(counts),
    ]),
  );
  const rankScoreDriftByModel = Object.fromEntries(modelVersions.map((version) => {
    const rows = driftScores.rows.filter((row) => row.modelVersion === version);
    return [version, driftReport(
      rows.filter((row) => row.scoreDate >= baselineFromDate && row.scoreDate <= baselineToDate)
        .map((row) => row.rankScore),
      rows.filter((row) => row.scoreDate >= fromDate).map((row) => row.rankScore),
    )];
  }));
  const driftFeatures = [
    "momentum7d",
    "momentum30d",
    "volatility30d",
    "priceStalenessDays",
    "confidence",
  ];
  const featureDriftByModel = Object.fromEntries(modelVersions.map((version) => {
    const rows = driftScores.rows.filter((row) => row.modelVersion === version);
    return [version, Object.fromEntries(driftFeatures.map((feature) => [
      feature,
      driftReport(
        rows.filter((row) => row.scoreDate >= baselineFromDate && row.scoreDate <= baselineToDate)
          .map((row) => row[feature]),
        rows.filter((row) => row.scoreDate >= fromDate).map((row) => row[feature]),
      ),
    ]))];
  }));
  const primaryModel = offlineEvaluation?.modelVersion ?? modelVersions.at(-1) ?? null;
  const primary = {
    offlineRanking: offlineEvaluation,
    calibration: primaryModel ? calibrationByModel[primaryModel] : null,
    drift: { rankScore: primaryModel ? rankScoreDriftByModel[primaryModel] : null },
    servingHealth: servingHealthReport(serving.rows),
  };
  const report = {
    schemaVersion: "ml-evaluation-report-v1",
    generatedAt: new Date().toISOString(),
    parameters: {
      asOfDate,
      currentWindow: { from: fromDate, to: asOfDate, days: windowDays },
      referenceWindow: { from: baselineFromDate, to: baselineToDate, days: baselineDays },
      maxRows,
      queryTruncated: scoreResult.rows.length === maxRows ||
        driftScores.rows.length === maxRows ||
        serving.rows.length === maxRows,
    },
    methodology: {
      comparisons: "Model and deterministic baseline are evaluated on the same scored user/date candidates.",
      engagement: "Observational event rates by attributed model cohort; no causal lift claim is made.",
      missingData: "Metrics are labeled unavailable or insufficient_data and are never coerced to zero.",
      drift: "Population stability index compares the explicit reference and current windows.",
      servedCandidateDiagnostic: "Database ranking comparison re-ranks only persisted model candidates and is not valid promotion evidence.",
    },
    primaryModel,
    offlineWalkForward: offlineEvaluation,
    servedCandidateRankingDiagnosticByModel: offlineByModel,
    calibrationByModel,
    engagementByCohort,
    drift: {
      rankScoreByModel: rankScoreDriftByModel,
      scoringInputByModel: featureDriftByModel,
    },
    servingHealth: primary.servingHealth,
  };
  const gatesRequested = hasFlag("--evaluate-gates");
  report.promotion = promotionGates(
    primary,
    gatesRequested && offlineEvaluation?.datasetKind === "real",
  );
  report.promotion.requested = gatesRequested;
  if (gatesRequested && offlineEvaluation?.datasetKind !== "real") {
    report.promotion.note =
      "Gates remain disabled without a supplied real-data walk-forward evaluation.";
  }
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (outputPath) {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, json, { mode: 0o600 });
    console.error(`Wrote ML evaluation report to ${outputPath}`);
  } else {
    process.stdout.write(json);
  }
} finally {
  await client.end();
}
