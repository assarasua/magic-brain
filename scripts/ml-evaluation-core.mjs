const round = (value, digits = 8) =>
  value === null || !Number.isFinite(value) ? null : Number(value.toFixed(digits));

const mean = (values) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

export const EVALUATION_POLICY = Object.freeze({
  minimumRankingGroups: 3,
  minimumCalibrationSamples: 100,
  minimumEngagementImpressions: 100,
  minimumDriftSamplesPerWindow: 100,
  minimumServingEvents: 100,
  maximumDownsideIncrease: 0.02,
  maximumCalibrationError: 0.1,
  maximumPopulationStabilityIndex: 0.2,
  minimumFreshScoreRatio: 0.95,
  maximumFallbackRatio: 0.05,
  maximumReportWindowDays: 90,
  maximumQueryRows: 100_000,
});

export function availability(value, sampleCount, minimumSamples) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return { status: "unavailable", value: null, sampleCount, minimumSamples };
  }
  if (sampleCount < minimumSamples) {
    return { status: "insufficient_data", value: round(value), sampleCount, minimumSamples };
  }
  return { status: "available", value: round(value), sampleCount, minimumSamples };
}

function rankingForGroup(rows, scoreKey, k) {
  const ranked = [...rows]
    .filter((row) => Number.isFinite(row[scoreKey]))
    .sort((left, right) =>
      right[scoreKey] - left[scoreKey] ||
      String(left.scryfallId).localeCompare(String(right.scryfallId)));
  const labeled = ranked.filter((row) => Number.isFinite(row.return30d));
  const selected = labeled.slice(0, k);
  if (!selected.length) return null;
  const gains = selected.map((row) => Math.max(0, row.return30d));
  const ideal = labeled
    .map((row) => Math.max(0, row.return30d))
    .sort((left, right) => right - left)
    .slice(0, k);
  const dcg = gains.reduce((sum, gain, index) => sum + gain / Math.log2(index + 2), 0);
  const idcg = ideal.reduce((sum, gain, index) => sum + gain / Math.log2(index + 2), 0);
  const downside = selected.filter((row) => Number.isFinite(row.downside90d));
  return {
    precisionAt10: selected.filter((row) => row.return30d > 0).length / selected.length,
    ndcgAt10: idcg > 0 ? dcg / idcg : null,
    hitRate: selected[0].return30d > 0 ? 1 : 0,
    downsideRate: downside.length
      ? downside.filter((row) => row.downside90d <= -0.1).length / downside.length
      : null,
    labelCoverage: ranked.length ? labeled.length / ranked.length : null,
    meanNetReturn30d: mean(selected.map((row) => row.return30d - 0.02)),
  };
}

export function rankingComparison(rows, options = {}) {
  const k = options.k ?? 10;
  const minimumGroups = options.minimumGroups ?? EVALUATION_POLICY.minimumRankingGroups;
  const groups = new Map();
  for (const row of rows) {
    const key = row.groupKey;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const perGroup = [...groups.entries()].map(([groupKey, values]) => ({
    groupKey,
    model: rankingForGroup(values, "modelScore", k),
    baseline: rankingForGroup(values, "baselineScore", k),
  })).filter((group) => group.model && group.baseline);
  const aggregate = (side, field) =>
    mean(perGroup.map((group) => group[side][field]).filter(Number.isFinite));
  const metric = (side, field) =>
    availability(aggregate(side, field), perGroup.length, minimumGroups);
  return {
    status: perGroup.length < minimumGroups ? "insufficient_data" : "available",
    groupCount: perGroup.length,
    minimumGroups,
    model: {
      precisionAt10: metric("model", "precisionAt10"),
      ndcgAt10: metric("model", "ndcgAt10"),
      hitRate: metric("model", "hitRate"),
      downsideRate: metric("model", "downsideRate"),
      labelCoverage: metric("model", "labelCoverage"),
      meanNetReturn30d: metric("model", "meanNetReturn30d"),
    },
    baseline: {
      precisionAt10: metric("baseline", "precisionAt10"),
      ndcgAt10: metric("baseline", "ndcgAt10"),
      hitRate: metric("baseline", "hitRate"),
      downsideRate: metric("baseline", "downsideRate"),
      labelCoverage: metric("baseline", "labelCoverage"),
      meanNetReturn30d: metric("baseline", "meanNetReturn30d"),
    },
  };
}

export function calibrationReport(
  rows,
  { binCount = 10, minimumSamples = EVALUATION_POLICY.minimumCalibrationSamples } = {},
) {
  const valid = rows.filter((row) =>
    Number.isFinite(row.probability) &&
    row.probability >= 0 &&
    row.probability <= 1 &&
    (row.outcome === 0 || row.outcome === 1));
  const bins = Array.from({ length: binCount }, (_, index) => ({
    lowerBound: index / binCount,
    upperBound: (index + 1) / binCount,
    sampleCount: 0,
    meanProbability: null,
    observedRate: null,
  }));
  for (const row of valid) {
    const bin = bins[Math.min(binCount - 1, Math.floor(row.probability * binCount))];
    bin.sampleCount += 1;
    bin.meanProbability = (bin.meanProbability ?? 0) + row.probability;
    bin.observedRate = (bin.observedRate ?? 0) + row.outcome;
  }
  for (const bin of bins) {
    if (!bin.sampleCount) continue;
    bin.meanProbability = round(bin.meanProbability / bin.sampleCount);
    bin.observedRate = round(bin.observedRate / bin.sampleCount);
  }
  const brier = mean(valid.map((row) => (row.probability - row.outcome) ** 2));
  const ece = bins.reduce((sum, bin) =>
    sum + (bin.sampleCount / (valid.length || 1)) *
      Math.abs((bin.meanProbability ?? 0) - (bin.observedRate ?? 0)), 0);
  return {
    status: valid.length
      ? valid.length < minimumSamples ? "insufficient_data" : "available"
      : "unavailable",
    sampleCount: valid.length,
    minimumSamples,
    brierScore: availability(brier, valid.length, minimumSamples),
    expectedCalibrationError: availability(valid.length ? ece : null, valid.length, minimumSamples),
    bins,
  };
}

function quantile(sorted, fraction) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))];
}

export function driftReport(
  referenceValues,
  currentValues,
  { binCount = 10, minimumSamples = EVALUATION_POLICY.minimumDriftSamplesPerWindow } = {},
) {
  const reference = referenceValues.filter(Number.isFinite).sort((a, b) => a - b);
  const current = currentValues.filter(Number.isFinite);
  if (!reference.length || !current.length) {
    return {
      status: "unavailable",
      referenceSampleCount: reference.length,
      currentSampleCount: current.length,
      minimumSamples,
      populationStabilityIndex: null,
    };
  }
  const boundaries = Array.from({ length: binCount - 1 }, (_, index) =>
    quantile(reference, (index + 1) / binCount));
  const bucket = (value) => boundaries.findIndex((boundary) => value <= boundary);
  const counts = (values) => {
    const result = Array(binCount).fill(0);
    for (const value of values) {
      const index = bucket(value);
      result[index === -1 ? binCount - 1 : index] += 1;
    }
    return result;
  };
  const referenceCounts = counts(reference);
  const currentCounts = counts(current);
  const epsilon = 1e-6;
  const psi = referenceCounts.reduce((sum, count, index) => {
    const expected = Math.max(epsilon, count / reference.length);
    const actual = Math.max(epsilon, currentCounts[index] / current.length);
    return sum + (actual - expected) * Math.log(actual / expected);
  }, 0);
  const sampleCount = Math.min(reference.length, current.length);
  return {
    status: sampleCount < minimumSamples ? "insufficient_data" : "available",
    referenceSampleCount: reference.length,
    currentSampleCount: current.length,
    minimumSamples,
    populationStabilityIndex: availability(psi, sampleCount, minimumSamples),
    boundaries: boundaries.map((value) => round(value)),
  };
}

export function engagementReport(counts, minimumImpressions = EVALUATION_POLICY.minimumEngagementImpressions) {
  const impressions = counts.impression ?? 0;
  const rate = (name) =>
    availability(impressions ? (counts[name] ?? 0) / impressions : null, impressions, minimumImpressions);
  return {
    status: impressions
      ? impressions < minimumImpressions ? "insufficient_data" : "available"
      : "unavailable",
    impressions,
    minimumImpressions,
    openDetailsRate: rate("open_details"),
    saveRate: rate("save_to_watchlist"),
    addToPortfolioRate: rate("add_to_portfolio"),
    dismissRate: rate("dismiss"),
  };
}

export function servingHealthReport(
  events,
  {
    minimumSamples = EVALUATION_POLICY.minimumServingEvents,
    maximumFreshAgeHours = 36,
  } = {},
) {
  const eligible = events.filter((event) => event.cohort === "ml");
  const served = eligible.filter((event) => event.source === "ml_batch");
  const fallback = eligible.filter((event) => event.source === "deterministic");
  const fresh = served.filter((event) =>
    Number.isFinite(event.scoreAgeHours) && event.scoreAgeHours <= maximumFreshAgeHours);
  const denominator = eligible.length;
  return {
    status: denominator
      ? denominator < minimumSamples ? "insufficient_data" : "available"
      : "unavailable",
    eligibleRequests: denominator,
    minimumSamples,
    fallbackRatio: availability(
      denominator ? fallback.length / denominator : null,
      denominator,
      minimumSamples,
    ),
    freshScoreRatio: availability(
      served.length ? fresh.length / served.length : null,
      served.length,
      minimumSamples,
    ),
    fallbackReasons: Object.fromEntries(
      [...new Set(fallback.map((event) => event.reason ?? "unknown"))]
        .sort()
        .map((reason) => [reason, fallback.filter((event) => (event.reason ?? "unknown") === reason).length]),
    ),
  };
}

export function promotionGates(report, enabled = false) {
  const gate = (name, metric, predicate) => ({
    name,
    status: !enabled
      ? "disabled"
      : metric?.status !== "available"
        ? metric?.status ?? "unavailable"
        : predicate(metric.value) ? "passed" : "failed",
  });
  const ranking = report.offlineRanking;
  const model = ranking?.model;
  const baseline = ranking?.baseline;
  return {
    enabled,
    decision: enabled ? "review_required" : "disabled",
    note: "Observational metrics are monitoring evidence, not causal product-lift evidence.",
    gates: [
      gate("precision_at_10_beats_baseline", model?.precisionAt10,
        (value) => value > baseline.precisionAt10.value),
      gate("ndcg_at_10_beats_baseline", model?.ndcgAt10,
        (value) => value > baseline.ndcgAt10.value),
      gate("downside_increase_at_most_two_points", model?.downsideRate,
        (value) => value <= baseline.downsideRate.value + EVALUATION_POLICY.maximumDownsideIncrease),
      gate("calibration_error_at_most_ten_percent", report.calibration?.expectedCalibrationError,
        (value) => value <= EVALUATION_POLICY.maximumCalibrationError),
      gate("score_drift_below_threshold", report.drift?.rankScore?.populationStabilityIndex,
        (value) => value <= EVALUATION_POLICY.maximumPopulationStabilityIndex),
      gate("fresh_score_ratio_at_least_95_percent", report.servingHealth?.freshScoreRatio,
        (value) => value >= EVALUATION_POLICY.minimumFreshScoreRatio),
      gate("fallback_ratio_at_most_five_percent", report.servingHealth?.fallbackRatio,
        (value) => value <= EVALUATION_POLICY.maximumFallbackRatio),
    ],
  };
}
