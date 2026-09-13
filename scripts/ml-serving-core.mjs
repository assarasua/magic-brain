import { createHash, timingSafeEqual } from "node:crypto";
import { explainPrediction, predictProbability } from "./ml-ranking-core.mjs";

export const SERVING_POLICY = Object.freeze({
  schemaVersion: "ml-ranking-artifact-v1",
  featureContractVersion: "v1",
  labelContractVersion: "v1",
  maxFeatureStalenessDays: 2,
  minHistoryDays: 90,
  minObservations90d: 60,
  minConfidence: 0.6,
  maxScoreAgeHours: 36,
  maxBudgetFractionPerCard: 0.45,
});

const EXPECTED_FEATURE_NAMES = [
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
  "momentum7d__missing",
  "momentum30d__missing",
  "momentum90d__missing",
  "volatility30d__missing",
  "drawdown90d__missing",
  "logCardAgeDays__missing",
  "isReserved__missing",
  "rarity=common",
  "rarity=uncommon",
  "rarity=rare",
  "rarity=mythic",
  "rarity=special",
  "rarity=bonus",
  "rarity=other",
];
const NUMERIC_FEATURE_NAMES = EXPECTED_FEATURE_NAMES.slice(0, 11);

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function assertDigest(actual, expected) {
  if (
    !/^[a-f0-9]{64}$/.test(expected ?? "") ||
    !timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"))
  ) {
    throw new Error("Artifact SHA-256 verification failed");
  }
}

export function verifyModelPackage(
  artifactBytes,
  metadata,
  { requiredStatus = "ready" } = {},
) {
  if (!Buffer.isBuffer(artifactBytes)) {
    artifactBytes = Buffer.from(artifactBytes);
  }
  assertDigest(sha256(artifactBytes), metadata?.artifact_sha256);
  let artifact;
  try {
    artifact = JSON.parse(artifactBytes.toString("utf8"));
  } catch {
    throw new Error("Artifact is not valid JSON");
  }
  if (metadata.status !== requiredStatus) {
    throw new Error(
      `Model ${metadata.version ?? "unknown"} is ${metadata.status ?? "invalid"}; ${requiredStatus} is required`,
    );
  }
  if (
    metadata.model_kind !== "learning_to_rank" ||
    artifact.schemaVersion !== SERVING_POLICY.schemaVersion ||
    artifact.modelVersion !== metadata.version ||
    artifact.featureContractVersion !== metadata.feature_contract_version ||
    artifact.labelContractVersion !== metadata.label_contract_version ||
    artifact.trainingCutoffDate !== metadata.training_cutoff_date ||
    artifact.featureContractVersion !== SERVING_POLICY.featureContractVersion ||
    artifact.labelContractVersion !== SERVING_POLICY.labelContractVersion
  ) {
    throw new Error("Artifact and registry contracts are incompatible");
  }
  const { featureNames, medians, means, scales } =
    artifact.model?.preprocessor ?? {};
  if (
    artifact.model?.algorithm !== "logistic_regression" ||
    !Array.isArray(featureNames) ||
    JSON.stringify(featureNames) !== JSON.stringify(EXPECTED_FEATURE_NAMES) ||
    !Array.isArray(artifact.model?.weights) ||
    featureNames.length !== artifact.model.weights.length ||
    !featureNames.length ||
    !artifact.model.weights.every(Number.isFinite) ||
    !Number.isFinite(artifact.model.intercept) ||
    !NUMERIC_FEATURE_NAMES.every(
      (name) =>
        Number.isFinite(medians?.[name]) &&
        Number.isFinite(means?.[name]) &&
        Number.isFinite(scales?.[name]) &&
        scales[name] > 0,
    )
  ) {
    throw new Error("Artifact model payload is invalid");
  }
  return artifact;
}

export function verifyPromotionEvaluation(evaluationBytes, modelVersion) {
  const evaluation = JSON.parse(Buffer.from(evaluationBytes).toString("utf8"));
  const checks = evaluation?.promotion?.checks ?? {};
  if (
    evaluation.schemaVersion !== "ml-ranking-evaluation-v1" ||
    evaluation.datasetKind !== "real" ||
    evaluation.modelVersion !== modelVersion ||
    evaluation.promotion?.decision !== "eligible_for_review" ||
    !Object.values(checks).length ||
    !Object.values(checks).every((value) => value === true)
  ) {
    throw new Error("Real-data promotion gates are not satisfied");
  }
  return { evaluation, sha256: sha256(evaluationBytes) };
}

export function scoreEligibility(feature, preferences) {
  const maximumPrice = Math.min(
    Number(preferences.maxCardPrice),
    Number(preferences.budget) * SERVING_POLICY.maxBudgetFractionPerCard,
  );
  const reasons = [];
  if (!Number.isFinite(feature.priceEur) || feature.priceEur <= 0) {
    reasons.push("invalid_price");
  } else if (feature.priceEur > maximumPrice) {
    reasons.push("unaffordable");
  }
  if (feature.priceStalenessDays > SERVING_POLICY.maxFeatureStalenessDays) {
    reasons.push("stale_price");
  }
  if (feature.historyDays < SERVING_POLICY.minHistoryDays) {
    reasons.push("insufficient_history");
  }
  if (feature.observations90d < SERVING_POLICY.minObservations90d) {
    reasons.push("insufficient_observations");
  }
  if (preferences.reservedOnly && !feature.isReserved) reasons.push("not_reserved");
  if (
    preferences.rarities?.length &&
    !preferences.rarities.includes(feature.rarity)
  ) {
    reasons.push("rarity_mismatch");
  }
  if (
    preferences.cardTypes?.length &&
    !preferences.cardTypes.some((type) =>
      (feature.cardType ?? "").toLowerCase().includes(type.toLowerCase()),
    )
  ) {
    reasons.push("card_type_mismatch");
  }
  if (
    preferences.setCodes?.length &&
    !preferences.setCodes.includes(feature.setCode)
  ) {
    reasons.push("set_mismatch");
  }
  if (
    preferences.colors?.length &&
    !preferences.colors.some((color) => feature.colors?.includes(color))
  ) {
    reasons.push("color_mismatch");
  }
  const releaseYear = Number((feature.releasedAt ?? "").slice(0, 4));
  if (
    (preferences.releaseEra === "classic" && releaseYear >= 2004) ||
    (preferences.releaseEra === "established" &&
      (releaseYear < 2004 || releaseYear > 2018)) ||
    (preferences.releaseEra === "recent" && releaseYear < 2019)
  ) {
    reasons.push("release_era_mismatch");
  }
  if (
    (preferences.marketTrend === "rising" && (feature.momentum30d ?? 0) <= 0) ||
    (preferences.marketTrend === "stable" &&
      (feature.volatility30d ?? 1) > 0.12) ||
    (preferences.marketTrend === "recovering" &&
      !((feature.momentum7d ?? 0) > 0 && (feature.momentum30d ?? 0) < 0))
  ) {
    reasons.push("market_trend_mismatch");
  }
  return { eligible: reasons.length === 0, reasons };
}

export function dataConfidence(feature) {
  const history = Math.min(1, feature.historyDays / 365);
  const coverage = Math.min(1, feature.observations90d / 90);
  const freshness =
    1 -
    Math.min(
      1,
      feature.priceStalenessDays / (SERVING_POLICY.maxFeatureStalenessDays + 1),
    );
  return Number((history * 0.25 + coverage * 0.55 + freshness * 0.2).toFixed(8));
}

function preferenceRelevance(feature, preferences) {
  let relevance = 0.55;
  if (preferences.reservedOnly && !feature.isReserved) return 0;
  if (preferences.rarities?.length) {
    relevance += preferences.rarities.includes(feature.rarity) ? 0.12 : -0.12;
  }
  if (preferences.strategy === "momentum") {
    relevance += Math.max(-0.15, Math.min(0.15, feature.momentum30d ?? 0));
  } else if (preferences.strategy === "stability") {
    relevance += Math.max(-0.15, 0.12 - (feature.volatility30d ?? 0.12));
  } else if (preferences.strategy === "collectible" && feature.isReserved) {
    relevance += 0.18;
  }
  const riskPenalty = {
    preservation: 1.8,
    conservative: 1.3,
    balanced: 0.8,
    growth: 0.4,
    aggressive: 0.15,
  }[preferences.risk] ?? 0.8;
  relevance -= Math.abs(feature.drawdown90d ?? -0.1) * riskPenalty;
  return Number(Math.max(0, Math.min(1, relevance)).toFixed(8));
}

export function buildUserScores(artifact, user, features) {
  const rows = [];
  for (const feature of features) {
    if (!scoreEligibility(feature, user.preferences).eligible) continue;
    const confidence = dataConfidence(feature);
    if (confidence < SERVING_POLICY.minConfidence) continue;
    const probability = predictProbability(artifact.model, feature);
    const relevance = preferenceRelevance(feature, user.preferences);
    if (relevance <= 0) continue;
    const expectedDownside = Math.max(-1, Math.min(0, feature.drawdown90d ?? -0.1));
    const riskPenalty = Math.abs(expectedDownside) * (1 - confidence);
    const rankScore = probability * 0.7 + relevance * 0.3 - riskPenalty;
    rows.push({
      userId: user.id,
      scryfallId: feature.scryfallId,
      scoreDate: feature.asOfDate,
      modelVersion: artifact.modelVersion,
      featureSnapshotId: feature.featureSnapshotId,
      rankScore: Number(rankScore.toFixed(8)),
      probabilityPositive30d: Number(probability.toFixed(8)),
      // The v1 artifact predicts only positive 30-day return. Keep the
      // outcome field null instead of presenting the observed drawdown proxy
      // as a learned downside prediction.
      expectedDownside90d: null,
      confidence,
      relevance,
      featureContributions: explainPrediction(artifact.model, feature),
    });
  }
  return rows.sort(
    (left, right) =>
      right.rankScore - left.rankScore ||
      left.scryfallId.localeCompare(right.scryfallId),
  ).slice(0, 100);
}

export function isExperimentMember(userId, cohortPercent) {
  if (!Number.isInteger(cohortPercent) || cohortPercent < 0 || cohortPercent > 100) {
    return false;
  }
  const bucket = Number.parseInt(sha256(`ml-ranking-v1:${userId}`).slice(0, 8), 16) % 100;
  return bucket < cohortPercent;
}

export function selectServingMode({
  enabled,
  userId,
  cohortPercent,
  scores,
  now = new Date(),
}) {
  if (!enabled) return { source: "deterministic", reason: "experiment_off" };
  if (!isExperimentMember(userId, cohortPercent)) {
    return { source: "deterministic", reason: "outside_cohort" };
  }
  if (!scores.length) return { source: "deterministic", reason: "scores_missing" };
  const nowTime = now.getTime();
  const valid = scores.filter((score) => {
    const generatedTime = new Date(score.generatedAt).getTime();
    const expiresTime = score.expiresAt
      ? new Date(score.expiresAt).getTime()
      : generatedTime + SERVING_POLICY.maxScoreAgeHours * 3_600_000;
    return (
      Number.isFinite(generatedTime) &&
      nowTime - generatedTime <= SERVING_POLICY.maxScoreAgeHours * 3_600_000 &&
      expiresTime > nowTime &&
      score.confidence >= SERVING_POLICY.minConfidence &&
      Array.isArray(score.featureContributions) &&
      score.featureContributions.length > 0
    );
  });
  if (!valid.length) return { source: "deterministic", reason: "scores_stale_or_unsafe" };
  return { source: "ml_batch", reason: null, scores: valid };
}

export const SCORE_UPSERT_SQL = `
  insert into app_ml_card_user_scores (
    user_id, scryfall_id, score_date, model_version, feature_snapshot_id,
    rank_score, probability_positive_30d, expected_downside_90d,
    confidence, relevance, feature_contributions, generated_at, expires_at
  )
  values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, now(), now() + interval '36 hours')
  on conflict (user_id, scryfall_id, score_date, model_version) do update set
    feature_snapshot_id = excluded.feature_snapshot_id,
    rank_score = excluded.rank_score,
    probability_positive_30d = excluded.probability_positive_30d,
    expected_downside_90d = excluded.expected_downside_90d,
    confidence = excluded.confidence,
    relevance = excluded.relevance,
    feature_contributions = excluded.feature_contributions,
    generated_at = excluded.generated_at,
    expires_at = excluded.expires_at
`;

export async function persistUserScores(
  client,
  { runId, userId, scoreDate, modelVersion, scores, usersCompleted, scoresWritten },
) {
  await client.query("begin");
  try {
    await client.query(
      `delete from app_ml_card_user_scores
        where user_id = $1 and score_date = $2 and model_version = $3`,
      [userId, scoreDate, modelVersion],
    );
    for (const score of scores) {
      await client.query(SCORE_UPSERT_SQL, [
        score.userId,
        score.scryfallId,
        score.scoreDate,
        score.modelVersion,
        score.featureSnapshotId,
        score.rankScore,
        score.probabilityPositive30d,
        score.expectedDownside90d,
        score.confidence,
        score.relevance,
        JSON.stringify(score.featureContributions),
      ]);
    }
    await client.query(
      `update app_ml_batch_runs
          set checkpoint_user_id = $2, users_completed = $3,
              scores_written = $4, updated_at = now()
        where id = $1`,
      [runId, userId, usersCompleted, scoresWritten],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}
