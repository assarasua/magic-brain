import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { attachSessionCookie, getOrCreateUser } from "@/lib/session";

export const runtime = "nodejs";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const { user, newToken } = await getOrCreateUser(request);
  const body = await request.json().catch(() => null) as {
    cardId?: unknown;
    scoreId?: unknown;
  } | null;
  if (
    !body ||
    typeof body.cardId !== "string" ||
    !UUID_PATTERN.test(body.cardId) ||
    typeof body.scoreId !== "string" ||
    !UUID_PATTERN.test(body.scoreId)
  ) {
    return NextResponse.json({ error: "Invalid smart alert" }, { status: 400 });
  }
  const inserted = await query<{ id: string }>(
    `
      insert into app_ml_smart_alerts (
        user_id, scryfall_id, model_score_id
      )
      select $1, score.scryfall_id, score.id
      from app_ml_card_user_scores score
      join app_ml_model_versions model on model.version = score.model_version
      where score.id = $2
        and score.user_id = $1
        and score.scryfall_id = $3
        and score.confidence >= 0.6
        and score.generated_at >= now() - interval '36 hours'
        and (score.expires_at is null or score.expires_at > now())
        and model.status = 'ready'
        and model.verified_at is not null
        and model.promotion_evidence->>'dataset_kind' = 'real'
      on conflict (user_id, scryfall_id) do update
      set model_score_id = excluded.model_score_id,
          enabled = true,
          updated_at = now()
      returning id::text
    `,
    [user.id, body.scoreId, body.cardId],
  );
  if (!inserted.rows[0]) {
    return NextResponse.json(
      { error: "A current verified score is required" },
      { status: 409 },
    );
  }
  return attachSessionCookie(
    NextResponse.json({ alertId: inserted.rows[0].id }, { status: 201 }),
    newToken,
  );
}
