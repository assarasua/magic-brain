import { randomUUID } from "node:crypto";
import { query } from "@/lib/db";
import type { MlServingDecision } from "@/lib/ml-serving";

export async function recordMlServingDecision(
  userId: string,
  ranking: MlServingDecision,
): Promise<void> {
  await query(
    `
      insert into app_ml_serving_events (
        request_id, user_id, surface, cohort, source, fallback_reason,
        model_version, score_date, score_generated_at
      )
      values ($1, $2, 'brain_signals', $3, $4, $5, $6, $7, $8)
    `,
    [
      randomUUID(),
      userId,
      ranking.cohort,
      ranking.source,
      ranking.reason,
      ranking.modelVersion,
      ranking.scoreDate,
      ranking.scoreGeneratedAt,
    ],
  );
}
