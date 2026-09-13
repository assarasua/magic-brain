# ML data contract v1

This contract is the shared boundary for ranking, batch serving, product feedback,
and offline evaluation. Migration `014_ml_data_contract.sql` owns the storage
schema. `src/lib/ml-contracts.ts` owns deterministic fixture generation and
temporal assertions. Neither performs training.

## Point-in-time boundary

A feature snapshot represents one card, source, and scoring date. A producer
must:

1. use only price rows whose `date <= as_of_date`;
2. use the latest eligible positive price as `source_max_price_date`;
3. record the first-known date of the exact metadata revision in
   `metadata_available_at`;
4. exclude metadata whose availability or card release is after the scoring
   date; and
5. write with `feature_contract_version = 'v1'`.

`released_at` is not a substitute for metadata availability. The current
catalogue may be used for historical snapshots only when the producer can prove
that each included value was available then. Unknown historical values stay
`NULL`; they must not be reconstructed from a later catalogue.

Features and labels are deliberately separate tables. Serving and feature
queries may read `app_ml_feature_snapshots`, but must never join
`app_ml_outcome_labels`. Snapshot writes are idempotent on card, scoring date,
price source, and feature version. A changed definition requires `v2`; never
rewrite the meaning of `v1`.

The v1 utility uses the latest observation on or before each feature lookback.
It records staleness explicitly. Outcome returns require a price on the exact
7-, 30-, or 90-calendar-day target. Missing targets produce a `NULL` return and
a false availability label instead of silently shifting the horizon.
`label_cutoff_date` is always `as_of_date + 90 days`; future observations beyond
that boundary are ignored.

## Feedback API

Authenticated clients can send `POST /api/ml/feedback` with at most 4 KiB:

```json
{
  "eventId": "11111111-1111-4111-8111-111111111111",
  "eventType": "impression",
  "surface": "brain_signals",
  "cardId": "22222222-2222-4222-8222-222222222222",
  "occurredAt": "2026-09-13T12:00:00.000Z",
  "scoreId": "33333333-3333-4333-8333-333333333333",
  "modelVersion": "ranking-v1",
  "rankPosition": 1
}
```

The client-generated UUID is required. Retrying an identical event returns
`200` with `duplicate: true`; reusing the UUID with different data returns
`409`. Unknown fields, timestamps older than 180 days, timestamps over five
minutes in the future, unowned score attribution, and coerced values are
rejected. `alert_action` additionally requires the `alert` surface and one of
`open`, `dismiss`, or `save`.

The event table intentionally has no free-form JSON, email, IP address,
user-agent, search text, or sensitive identity fields. User deletion cascades
through feedback and personalized scores. Do not add such fields without a
separate privacy review and retention policy.

## Model and score boundary

`app_ml_model_versions` identifies the feature version, label version, training
cutoff, ranking policy, and optional content-addressed artifact. Artifact URI
and SHA-256 digest must be written together. Later phases must not mark a model
`ready` until its walk-forward evaluation and artifact verification pass.

Every `app_ml_card_user_scores` row references the exact feature snapshot for
the same card and score date. Scores are idempotent per user, card, date, and
model version. `feature_contributions` is an array of at most ten explanation
items; downstream producers should use this stable item shape:

```json
{ "feature": "momentum_30d", "contribution": 0.18, "direction": "positive" }
```

Do not expose a score without its model version, source date, confidence, and
at least one contribution or an explicit deterministic fallback explanation.
Do not use score rows as outcome labels.

## Evaluation rules for later phases

- Split by scoring date with walk-forward folds; random row splits are invalid.
- Fit imputers, encoders, and thresholds on each training fold only.
- Keep all printings for a card/date on one side of a fold boundary where a
  set-based holdout is used.
- Evaluate 7-, 30-, and 90-day outcomes only after their label cutoff matures.
- Report unavailable labels as coverage, not as zero return.
- Pin dataset, feature, label, and model versions in every evaluation result.
- Preserve the deterministic ranking as the serving fallback.

Run `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build` after
changing this contract. The fixture tests prove that adding future prices
cannot alter a feature snapshot and that post-date metadata is rejected.
