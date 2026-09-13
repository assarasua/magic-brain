import { createHash } from "node:crypto";
import { query } from "@/lib/db";
import type { UserPreferences } from "@/lib/user-preferences";

const MIN_CONFIDENCE = 0.6;
const MAX_SCORE_AGE_HOURS = 36;

type ScoreRow = {
  id: string;
  name: string;
  set_code: string;
  set_name: string;
  collector_number: string;
  rarity: string;
  type_line: string | null;
  image_url: string | null;
  cardmarket_id: number | null;
  price: string;
  foil_price: string | null;
  change_7d: string | null;
  price_date: string;
  score_id: string;
  model_version: string;
  rank_score: string;
  confidence: string;
  probability_positive_30d: string | null;
  expected_downside_90d: string | null;
  feature_contributions: unknown;
  generated_at: string;
  score_date: string;
};

export type MlRankingStatus = {
  source: "ml_batch" | "deterministic";
  reason:
    | null
    | "experiment_off"
    | "outside_cohort"
    | "scores_missing_or_stale";
  modelVersion: string | null;
  scoreDate: string | null;
};

const configuredCohortPercent = () => {
  const value = Number(process.env.ML_RANKING_COHORT_PERCENT ?? "0");
  return Number.isInteger(value) && value >= 0 && value <= 100 ? value : 0;
};

export function mlExperimentAssignment(userId: string) {
  if (process.env.ML_RANKING_EXPERIMENT_ENABLED !== "true") {
    return { enabled: false, reason: "experiment_off" as const };
  }
  const bucket =
    Number.parseInt(
      createHash("sha256")
        .update(`ml-ranking-v1:${userId}`)
        .digest("hex")
        .slice(0, 8),
      16,
    ) % 100;
  if (bucket >= configuredCohortPercent()) {
    return { enabled: false, reason: "outside_cohort" as const };
  }
  return { enabled: true, reason: null };
}

export async function getPersonalizedBatchSignals(
  userId: string,
  preferences: UserPreferences,
  limit = 10,
) {
  const assignment = mlExperimentAssignment(userId);
  if (!assignment.enabled) {
    return { signals: [], ranking: {
      source: "deterministic",
      reason: assignment.reason,
      modelVersion: null,
      scoreDate: null,
    } satisfies MlRankingStatus };
  }

  const maximumPrice = Math.min(
    preferences.maxCardPrice,
    preferences.defaultBudget * 0.45,
  );
  const { rows } = await query<ScoreRow>(
    `
      with latest_scores as (
        select scores.score_date, scores.model_version
        from app_ml_card_user_scores scores
        join app_ml_model_versions model on model.version = scores.model_version
        where scores.user_id = $1
          and model.status = 'ready'
          and scores.score_date >= current_date - 2
          and scores.confidence >= $2
          and scores.generated_at >= now() - ($3::text || ' hours')::interval
          and (scores.expires_at is null or scores.expires_at > now())
        order by scores.score_date desc, model.verified_at desc, model.version desc
        limit 1
      ),
      price_dates as (
        select
          max(date) as latest_date,
          max(date) filter (where date <= current_date - 7) as previous_date
        from prices
        where source = 'mtgjson'
      )
      select
        c.scryfall_id::text as id, c.name, c.set_code, c.set_name,
        c.collector_number, c.rarity, c.type_line,
        coalesce(c.image_url, c.image_uris->>'normal') as image_url,
        c.cardmarket_id, current_price.eur as price,
        current_price.eur_foil as foil_price,
        case when previous_price.eur > 0
          then ((current_price.eur - previous_price.eur) / previous_price.eur) * 100
          else null end as change_7d,
        current_price.date::text as price_date,
        scores.id::text as score_id, scores.model_version,
        scores.rank_score, scores.confidence,
        scores.probability_positive_30d, scores.expected_downside_90d,
        scores.feature_contributions, scores.generated_at::text,
        scores.score_date::text
      from latest_scores
      join app_ml_card_user_scores scores
        on scores.user_id = $1
       and scores.score_date = latest_scores.score_date
       and scores.model_version = latest_scores.model_version
      join app_ml_model_versions model
        on model.version = scores.model_version and model.status = 'ready'
      join cards c on c.scryfall_id = scores.scryfall_id
      cross join price_dates
      join prices current_price
        on current_price.scryfall_id = c.scryfall_id
       and current_price.date = price_dates.latest_date
       and current_price.source = 'mtgjson'
      left join prices previous_price
        on previous_price.scryfall_id = c.scryfall_id
       and previous_price.date = price_dates.previous_date
       and previous_price.source = 'mtgjson'
      where scores.confidence >= $2
        and scores.generated_at >= now() - ($3::text || ' hours')::interval
        and (scores.expires_at is null or scores.expires_at > now())
        and jsonb_array_length(scores.feature_contributions) > 0
        and current_price.eur between 2 and $4
      order by scores.rank_score desc, scores.scryfall_id
      limit $5
    `,
    [userId, MIN_CONFIDENCE, MAX_SCORE_AGE_HOURS, maximumPrice, limit],
  );

  if (!rows.length) {
    return { signals: [], ranking: {
      source: "deterministic",
      reason: "scores_missing_or_stale",
      modelVersion: null,
      scoreDate: null,
    } satisfies MlRankingStatus };
  }
  return {
    signals: rows.map((row) => ({
      id: row.id,
      name: row.name,
      setCode: row.set_code,
      setName: row.set_name,
      collectorNumber: row.collector_number,
      rarity: row.rarity,
      typeLine: row.type_line,
      imageUrl: row.image_url,
      cardmarketId: row.cardmarket_id,
      price: Number(row.price),
      foilPrice: row.foil_price === null ? null : Number(row.foil_price),
      change7d: row.change_7d === null ? null : Number(row.change_7d),
      priceDate: row.price_date,
      direction: Number(row.change_7d ?? 0) >= 0 ? "up" as const : "down" as const,
      ml: {
        scoreId: row.score_id,
        modelVersion: row.model_version,
        score: Number(row.rank_score),
        confidence: Number(row.confidence),
        probabilityPositive30d:
          row.probability_positive_30d === null
            ? null
            : Number(row.probability_positive_30d),
        expectedDownside90d:
          row.expected_downside_90d === null
            ? null
            : Number(row.expected_downside_90d),
        contributions: row.feature_contributions,
        generatedAt: row.generated_at,
      },
    })),
    ranking: {
      source: "ml_batch",
      reason: null,
      modelVersion: rows[0].model_version,
      scoreDate: rows[0].score_date,
    } satisfies MlRankingStatus,
  };
}
