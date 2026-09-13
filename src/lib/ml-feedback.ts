import { query } from "@/lib/db";
import type { MlFeedbackEvent } from "@/lib/ml-feedback-contract";

type FeedbackRow = {
  id: string;
  client_event_id: string;
  event_type: string;
  surface: string;
  scryfall_id: string;
  model_score_id: string | null;
  model_version: string | null;
  rank_position: number | null;
  alert_action: string | null;
  occurred_at: string;
};

export class FeedbackIdempotencyConflictError extends Error {}
export class FeedbackReferenceError extends Error {}

function matches(row: FeedbackRow, event: MlFeedbackEvent): boolean {
  return (
    row.client_event_id.toLowerCase() === event.eventId &&
    row.event_type === event.eventType &&
    row.surface === event.surface &&
    row.scryfall_id.toLowerCase() === event.cardId &&
    (row.model_score_id?.toLowerCase() ?? null) === event.scoreId &&
    row.model_version === event.modelVersion &&
    row.rank_position === event.rankPosition &&
    row.alert_action === event.alertAction &&
    new Date(row.occurred_at).toISOString() === event.occurredAt
  );
}

export async function persistMlFeedbackEvent(
  userId: string,
  event: MlFeedbackEvent,
): Promise<{ id: string; created: boolean }> {
  const values = [
    userId,
    event.eventId,
    event.eventType,
    event.surface,
    event.cardId,
    event.scoreId,
    event.modelVersion,
    event.rankPosition,
    event.alertAction,
    event.occurredAt,
  ];
  const inserted = await query<{ id: string }>(
    `
      insert into app_ml_feedback_events (
        user_id, client_event_id, event_type, surface, scryfall_id,
        model_score_id, model_version, rank_position, alert_action, occurred_at
      )
      select $1, $2, $3, $4, c.scryfall_id, $6, $7, $8, $9, $10
      from cards c
      where c.scryfall_id = $5
        and (
          $6::uuid is null
          or exists (
            select 1
            from app_ml_card_user_scores score
            where score.id = $6
              and score.user_id = $1
              and score.scryfall_id = $5
              and ($7::text is null or score.model_version = $7)
          )
        )
      on conflict (user_id, client_event_id) do nothing
      returning id::text
    `,
    values,
  );
  if (inserted.rows[0]) {
    return { id: inserted.rows[0].id, created: true };
  }

  const existing = await query<FeedbackRow>(
    `
      select
        id::text, client_event_id::text, event_type, surface,
        scryfall_id::text, model_score_id::text, model_version,
        rank_position, alert_action, occurred_at::text
      from app_ml_feedback_events
      where user_id = $1 and client_event_id = $2
    `,
    [userId, event.eventId],
  );
  if (!existing.rows[0]) {
    throw new FeedbackReferenceError(
      "Card or model score attribution does not exist",
    );
  }
  if (!matches(existing.rows[0], event)) {
    throw new FeedbackIdempotencyConflictError(
      "Event ID was already used with different data",
    );
  }
  return { id: existing.rows[0].id, created: false };
}
