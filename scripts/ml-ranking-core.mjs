import { createHash } from "node:crypto";

export const RANKING_SEED = 20260913;
export const MODEL_VERSION = "ranking-logistic-v1";
export const DATASET_CONTRACT_VERSION = "ml-ranking-dataset-v1";

const NUMERIC_FEATURES = [
  "momentum7d",
  "momentum30d",
  "momentum90d",
  "volatility30d",
  "drawdown90d",
  "logPriceEur",
  "logHistoryDays",
  "observations90d",
  "priceStalenessDays",
  "logCardAgeDays",
  "isReserved",
];
const NULLABLE_FEATURES = new Set([
  "momentum7d",
  "momentum30d",
  "momentum90d",
  "volatility30d",
  "drawdown90d",
  "logCardAgeDays",
  "isReserved",
]);
const RARITIES = ["common", "uncommon", "rare", "mythic", "special", "bonus"];

function round(value, digits = 8) {
  return Number(value.toFixed(digits));
}

function mean(values) {
  return values.length
    ? values.reduce((total, value) => total + value, 0) / values.length
    : null;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function datasetVersion(rows) {
  return `sha256:${sha256(stableJson(rows))}`;
}

function assertIsoDate(value, field) {
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(parsed) ||
    new Date(parsed).toISOString().slice(0, 10) !== value
  ) {
    throw new Error(`${field} must be an ISO calendar date`);
  }
}

export function validateRows(rows) {
  if (!Array.isArray(rows) || !rows.length) {
    throw new Error("Ranking dataset must contain rows");
  }
  const identities = new Set();
  for (const [index, row] of rows.entries()) {
    if (row.featureContractVersion !== "v1" || row.labelContractVersion !== "v1") {
      throw new Error(`Row ${index} does not use phase-1 contract v1`);
    }
    assertIsoDate(row.asOfDate, `rows[${index}].asOfDate`);
    assertIsoDate(row.labelCutoffDate, `rows[${index}].labelCutoffDate`);
    assertIsoDate(row.metadataAvailableAt, `rows[${index}].metadataAvailableAt`);
    assertIsoDate(row.sourceMaxPriceDate, `rows[${index}].sourceMaxPriceDate`);
    if (
      row.metadataAvailableAt > row.asOfDate ||
      row.sourceMaxPriceDate > row.asOfDate
    ) {
      throw new Error(`Row ${index} contains post-scoring feature information`);
    }
    const expectedCutoff = new Date(
      Date.parse(`${row.asOfDate}T00:00:00.000Z`) + 90 * 86_400_000,
    )
      .toISOString()
      .slice(0, 10);
    if (row.labelCutoffDate !== expectedCutoff) {
      throw new Error(`Row ${index} has an invalid 90-day label cutoff`);
    }
    if (
      row.has30dPrice !== (row.return30d !== null) ||
      row.has90dPrice !== (row.return90d !== null)
    ) {
      throw new Error(`Row ${index} has inconsistent label availability`);
    }
    const identity = `${row.scryfallId}|${row.asOfDate}|${row.priceSource}`;
    if (identities.has(identity)) throw new Error(`Duplicate row ${identity}`);
    identities.add(identity);
  }
}

export function deterministicScore(row) {
  const change7d = (row.momentum7d ?? 0) * 100;
  const change30d = (row.momentum30d ?? 0) * 100;
  const volatility = Math.abs(change7d - change30d / 4);
  return change30d * 0.55 + change7d * 0.32 - volatility * 0.32;
}

function rawFeatures(row) {
  return {
    momentum7d: row.momentum7d,
    momentum30d: row.momentum30d,
    momentum90d: row.momentum90d,
    volatility30d: row.volatility30d,
    drawdown90d: row.drawdown90d,
    logPriceEur: Math.log1p(row.priceEur),
    logHistoryDays: Math.log1p(row.historyDays),
    observations90d: row.observations90d,
    priceStalenessDays: row.priceStalenessDays,
    logCardAgeDays:
      row.cardAgeDays === null ? null : Math.log1p(row.cardAgeDays),
    isReserved:
      row.isReserved === null ? null : row.isReserved ? 1 : 0,
  };
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

export function fitPreprocessor(rows) {
  const values = rows.map(rawFeatures);
  const medians = {};
  const means = {};
  const scales = {};
  for (const feature of NUMERIC_FEATURES) {
    const observed = values
      .map((row) => row[feature])
      .filter((value) => typeof value === "number" && Number.isFinite(value));
    medians[feature] = median(observed);
    const imputed = values.map((row) => row[feature] ?? medians[feature]);
    means[feature] = mean(imputed) ?? 0;
    const variance =
      mean(imputed.map((value) => (value - means[feature]) ** 2)) ?? 0;
    scales[feature] = Math.sqrt(variance) || 1;
  }
  const featureNames = [
    ...NUMERIC_FEATURES,
    ...NUMERIC_FEATURES.filter((name) => NULLABLE_FEATURES.has(name)).map(
      (name) => `${name}__missing`,
    ),
    ...RARITIES.map((rarity) => `rarity=${rarity}`),
    "rarity=other",
  ];
  return { featureNames, medians, means, scales };
}

export function transformRow(row, preprocessor) {
  const raw = rawFeatures(row);
  const values = NUMERIC_FEATURES.map(
    (name) =>
      ((raw[name] ?? preprocessor.medians[name]) - preprocessor.means[name]) /
      preprocessor.scales[name],
  );
  for (const name of NUMERIC_FEATURES) {
    if (NULLABLE_FEATURES.has(name)) values.push(raw[name] === null ? 1 : 0);
  }
  const rarity = (row.rarity ?? "").toLowerCase();
  for (const category of RARITIES) values.push(rarity === category ? 1 : 0);
  values.push(RARITIES.includes(rarity) ? 0 : 1);
  return values;
}

function sigmoid(value) {
  if (value >= 0) return 1 / (1 + Math.exp(-Math.min(value, 35)));
  const exponential = Math.exp(Math.max(value, -35));
  return exponential / (1 + exponential);
}

export function fitLogisticModel(
  rows,
  { seed = RANKING_SEED, iterations = 800, learningRate = 0.08, l2 = 0.02 } = {},
) {
  if (!rows.length) throw new Error("Cannot fit a model without rows");
  const preprocessor = fitPreprocessor(rows);
  const matrix = rows.map((row) => transformRow(row, preprocessor));
  const targets = rows.map((row) => (row.return30d > 0 ? 1 : 0));
  const random = seededRandom(seed);
  const weights = preprocessor.featureNames.map(() => (random() - 0.5) * 1e-6);
  const positiveRate = Math.min(0.999, Math.max(0.001, mean(targets) ?? 0.5));
  let intercept = Math.log(positiveRate / (1 - positiveRate));

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const weightGradients = weights.map(() => 0);
    let interceptGradient = 0;
    for (let rowIndex = 0; rowIndex < matrix.length; rowIndex += 1) {
      const score =
        intercept +
        matrix[rowIndex].reduce(
          (total, value, column) => total + value * weights[column],
          0,
        );
      const error = sigmoid(score) - targets[rowIndex];
      interceptGradient += error;
      for (let column = 0; column < weights.length; column += 1) {
        weightGradients[column] += error * matrix[rowIndex][column];
      }
    }
    const rate = learningRate / Math.sqrt(1 + iteration / 100);
    intercept -= rate * (interceptGradient / matrix.length);
    for (let column = 0; column < weights.length; column += 1) {
      weights[column] -=
        rate *
        (weightGradients[column] / matrix.length + l2 * weights[column]);
    }
  }
  return {
    algorithm: "logistic_regression",
    target: "return_30d_positive",
    seed,
    iterations,
    learningRate,
    l2,
    intercept: round(intercept, 12),
    weights: weights.map((value) => round(value, 12)),
    preprocessor,
  };
}

export function predictProbability(model, row) {
  const values = transformRow(row, model.preprocessor);
  const score =
    model.intercept +
    values.reduce(
      (total, value, index) => total + value * model.weights[index],
      0,
    );
  return sigmoid(score);
}

export function explainPrediction(model, row, limit = 10) {
  const values = transformRow(row, model.preprocessor);
  return values
    .map((value, index) => ({
      feature: model.preprocessor.featureNames[index],
      contribution: round(value * model.weights[index]),
      direction: value * model.weights[index] >= 0 ? "positive" : "negative",
    }))
    .sort(
      (left, right) =>
        Math.abs(right.contribution) - Math.abs(left.contribution),
    )
    .slice(0, limit);
}

function rankingMetrics(scoredRows, scoreName, k) {
  const ranked = [...scoredRows].sort(
    (left, right) =>
      right[scoreName] - left[scoreName] ||
      left.scryfallId.localeCompare(right.scryfallId),
  );
  const labeled = ranked.filter((row) => row.return30d !== null);
  const selected = labeled.slice(0, k);
  const precision =
    selected.length > 0
      ? selected.filter((row) => row.return30d > 0).length / selected.length
      : null;
  const gains = selected.map((row) => Math.max(0, row.return30d));
  const dcg = gains.reduce(
    (total, gain, index) => total + gain / Math.log2(index + 2),
    0,
  );
  const ideal = labeled
    .map((row) => Math.max(0, row.return30d))
    .sort((left, right) => right - left)
    .slice(0, k)
    .reduce(
      (total, gain, index) => total + gain / Math.log2(index + 2),
      0,
    );
  const downsideAvailable = selected.filter(
    (row) => row.downside90d !== null,
  );
  return {
    precisionAt10: precision,
    ndcgAt10: ideal > 0 ? dcg / ideal : null,
    hitRate: selected.length ? (selected[0].return30d > 0 ? 1 : 0) : null,
    downsideRate:
      downsideAvailable.length > 0
        ? downsideAvailable.filter((row) => row.downside90d <= -0.1).length /
          downsideAvailable.length
        : null,
    downsideCoverage:
      selected.length > 0 ? downsideAvailable.length / selected.length : null,
    meanNetReturn30d:
      selected.length > 0
        ? mean(selected.map((row) => row.return30d - 0.02))
        : null,
    evaluatedAtK: selected.length,
  };
}

function calibration(scoredRows) {
  const rows = scoredRows.filter((row) => row.return30d !== null);
  if (!rows.length) return null;
  const bins = Array.from({ length: 10 }, () => []);
  for (const row of rows) {
    bins[Math.min(9, Math.floor(row.learnedScore * 10))].push(row);
  }
  const brier = mean(
    rows.map(
      (row) =>
        (row.learnedScore - (row.return30d > 0 ? 1 : 0)) ** 2,
    ),
  );
  const expectedCalibrationError = bins.reduce((total, bin) => {
    if (!bin.length) return total;
    const confidence = mean(bin.map((row) => row.learnedScore));
    const accuracy = mean(bin.map((row) => (row.return30d > 0 ? 1 : 0)));
    return (
      total +
      (bin.length / rows.length) * Math.abs(confidence - accuracy)
    );
  }, 0);
  return {
    brierScore: round(brier),
    expectedCalibrationError: round(expectedCalibrationError),
    sampleCount: rows.length,
  };
}

function aggregateFoldMetrics(folds, key) {
  const fields = [
    "precisionAt10",
    "ndcgAt10",
    "hitRate",
    "downsideRate",
    "downsideCoverage",
    "meanNetReturn30d",
  ];
  return Object.fromEntries(
    fields.map((field) => [
      field,
      round(
        mean(
          folds
            .map((fold) => fold[key][field])
            .filter((value) => value !== null),
        ) ?? 0,
      ),
    ]),
  );
}

export function evaluateWalkForward(rows, options = {}) {
  validateRows(rows);
  const k = options.k ?? 10;
  const minTrainingDates = options.minTrainingDates ?? 2;
  const dates = [...new Set(rows.map((row) => row.asOfDate))].sort();
  const folds = [];
  for (let index = minTrainingDates; index < dates.length; index += 1) {
    const testDate = dates[index];
    const training = rows.filter(
      (row) =>
        row.asOfDate < testDate &&
        row.labelCutoffDate <= testDate &&
        row.return30d !== null,
    );
    if (
      training.length < 10 ||
      !training.some((row) => row.return30d > 0) ||
      !training.some((row) => row.return30d <= 0)
    ) {
      continue;
    }
    const test = rows.filter((row) => row.asOfDate === testDate);
    const model = fitLogisticModel(training, { seed: options.seed ?? RANKING_SEED });
    const scored = test.map((row) => ({
      ...row,
      deterministicScore: deterministicScore(row),
      learnedScore: predictProbability(model, row),
    }));
    folds.push({
      testDate,
      trainingRows: training.length,
      trainingMaxAsOfDate: training
        .map((row) => row.asOfDate)
        .sort()
        .at(-1),
      trainingMaxLabelCutoffDate: training
        .map((row) => row.labelCutoffDate)
        .sort()
        .at(-1),
      testRows: test.length,
      labelCoverage30d:
        test.filter((row) => row.return30d !== null).length / test.length,
      deterministic: rankingMetrics(scored, "deterministicScore", k),
      learned: rankingMetrics(scored, "learnedScore", k),
      learnedCalibration: calibration(scored),
    });
  }
  if (!folds.length) {
    throw new Error("No valid walk-forward folds; add mature chronological data");
  }
  const calibrationRows = [];
  for (const fold of folds) {
    const training = rows.filter(
      (row) =>
        row.asOfDate < fold.testDate &&
        row.labelCutoffDate <= fold.testDate &&
        row.return30d !== null,
    );
    const model = fitLogisticModel(training, { seed: options.seed ?? RANKING_SEED });
    for (const row of rows.filter((candidate) => candidate.asOfDate === fold.testDate)) {
      calibrationRows.push({ ...row, learnedScore: predictProbability(model, row) });
    }
  }
  const deterministic = aggregateFoldMetrics(folds, "deterministic");
  const learned = aggregateFoldMetrics(folds, "learned");
  return {
    methodology: {
      split: "expanding_walk_forward_by_as_of_date",
      deterministicComparator: "brain_balanced_medium_diversified_any_v1",
      labelMaturityRule: "label_cutoff_date <= test_date",
      exactTarget: "return_30d from exact calendar-date price",
      missingLabels: "excluded_from metric denominators and reported as coverage",
      k,
      seed: options.seed ?? RANKING_SEED,
      transactionCost: 0.02,
    },
    folds,
    aggregate: {
      foldCount: folds.length,
      candidateRows: folds.reduce((total, fold) => total + fold.testRows, 0),
      labelCoverage30d: round(
        mean(folds.map((fold) => fold.labelCoverage30d)) ?? 0,
      ),
      deterministic: { ...deterministic, calibration: null },
      learned: {
        ...learned,
        calibration: calibration(calibrationRows),
      },
    },
  };
}

export function trainFinalArtifact(
  rows,
  cutoffDate,
  seed = RANKING_SEED,
  modelVersion = MODEL_VERSION,
) {
  validateRows(rows);
  const training = rows.filter(
    (row) =>
      row.asOfDate < cutoffDate &&
      row.labelCutoffDate <= cutoffDate &&
      row.return30d !== null,
  );
  if (!training.length) throw new Error("No mature rows for final artifact");
  const model = fitLogisticModel(training, { seed });
  return {
    schemaVersion: "ml-ranking-artifact-v1",
    modelVersion,
    featureContractVersion: "v1",
    labelContractVersion: "v1",
    trainingCutoffDate: cutoffDate,
    trainingRows: training.length,
    model,
  };
}

export function promotionAssessment(report, datasetKind) {
  const learned = report.aggregate.learned;
  const baseline = report.aggregate.deterministic;
  const checks = {
    minimumThreeFolds: report.aggregate.foldCount >= 3,
    coverageAtLeast95Percent: report.aggregate.labelCoverage30d >= 0.95,
    precisionAt10BeatsBaseline:
      learned.precisionAt10 > baseline.precisionAt10,
    ndcgAt10BeatsBaseline: learned.ndcgAt10 > baseline.ndcgAt10,
    downsideIncreaseAtMostTwoPoints:
      learned.downsideRate <= baseline.downsideRate + 0.02,
  };
  return {
    decision:
      datasetKind === "real" && Object.values(checks).every(Boolean)
        ? "eligible_for_human_review"
        : "not_eligible",
    checks,
    note:
      datasetKind === "synthetic"
        ? "Synthetic fixtures validate the pipeline only and cannot support promotion."
        : "Eligibility is not deployment approval; review regimes, data quality, and artifact verification.",
  };
}
