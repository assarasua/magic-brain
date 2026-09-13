# ML batch serving operations

The serving system is deliberately inactive by default. The checked-in
`ranking-logistic-v1-baefdf1ff3c3` artifact is trained on synthetic fixtures,
remains `draft`, and must never be described as production model evidence.

## Promotion and registry

Apply migrations through the normal release process before using these
commands. Neither command migrates or deploys.

Verify and register an artifact as draft:

```sh
DATABASE_URL='postgresql://…' npm run ml:register -- \
  --metadata artifacts/ml-ranking/ranking-logistic-v1-baefdf1ff3c3.metadata.json
```

Ready promotion is an explicit reviewer action and accepts only an evaluation
whose `datasetKind` is `real`, decision is `eligible_for_review`, all generated
promotion checks pass, and model version matches:

```sh
DATABASE_URL='postgresql://…' npm run ml:register -- \
  --metadata artifacts/ml-ranking/real/<model>.metadata.json \
  --promote-ready \
  --evaluation artifacts/ml-ranking/real/<model>.evaluation.json \
  --approved-by '<reviewer identity>'
```

Artifact bytes are SHA-256 verified before any registry write. Artifact,
registry, feature, label, training-cutoff, and model versions must agree.
Migration `015_ml_batch_serving.sql` independently prevents a `ready` row
without real-data promotion evidence and three explicit operational gates.

## Daily scoring

Run after the point-in-time feature snapshot for the day is complete:

```sh
DATABASE_URL='postgresql://…' npm run ml:score-daily -- \
  --metadata artifacts/ml-ranking/real/<model>.metadata.json
```

Use `--score-date YYYY-MM-DD` to replay a particular snapshot and `--page-size`
to tune user transaction size. The job only accepts an artifact matching a
`ready` registry row. It performs no training and reads no outcome-label table.

The `(score_date, model_version)` run identity and per-user checkpoint make the
job resumable. Each user and checkpoint commit atomically. Score writes use the
unique `(user_id, scryfall_id, score_date, model_version)` key with `ON
CONFLICT DO UPDATE`, so retries replace the same result instead of duplicating
it. A completed run exits without rewriting scores.

For local development, use a disposable PostgreSQL database and keep the
experiment disabled. In CI, run tests and static migration checks; do not
connect to production. In production, configure the command above in the
platform scheduler once daily after feature generation, with `DATABASE_URL`
from the scheduler's secret store. Capture exit status and alert on failures;
the command does not print credentials.

## Read path and fallback

`GET /api/brain/signals` keeps its existing `signals` payload and adds:

```json
{
  "ranking": {
    "source": "ml_batch",
    "reason": null,
    "modelVersion": "ranking-logistic-v1-…",
    "scoreDate": "YYYY-MM-DD"
  }
}
```

ML signals also include an `ml` object with score ID, version, confidence,
probability, nullable downside estimate, generated time, and feature
contributions. The current v1 artifact has no learned downside head, so that
field remains `null`; observed drawdown is used only as a safety penalty.
There is no request-time training or model inference.

Set both server-only variables to opt a stable hash cohort into reads:

```sh
ML_RANKING_EXPERIMENT_ENABLED=true
ML_RANKING_COHORT_PERCENT=5
```

The deterministic market-mover response is used when the experiment is off,
the user is outside the cohort, no compatible score exists, the score is over
36 hours old or expired, confidence is below `0.60`, explanations are missing,
the model is not `ready`, or current price exceeds the user's affordability
limit. Any score-read failure also falls back. The response reports the reason
as `experiment_off`, `outside_cohort`, or `scores_missing_or_stale`.

Batch scoring additionally excludes stale prices, fewer than 90 history days,
fewer than 60 observations in 90 days, preference mismatches, and cards over
the lower of the user's maximum card price and 45% of budget. These are hard
policy checks outside the learned probability.

## Customer experience

Migration `016_ml_product_experience.sql` adds the allowlisted Daily News and
Opportunity Graph feedback surfaces plus user-confirmed smart-alert
subscriptions. Run the normal migration command before enabling the
experiment.

When a fresh score from a real-data, verified, `ready` model exists, Brain
Signals, Predict, Discover, Portfolio, Daily News, and Opportunity Graph show
the same compact method/confidence/freshness/driver disclosure. Candidate
lists use learned ordering where supported. Otherwise they retain their
deterministic order and explicitly label the fallback; deterministic scores
are never presented as learned output.

Verified learned scores appear only after:

1. A real-data artifact passes promotion gates and is registered as `ready`.
2. Daily batch scoring writes current, unexpired user scores with confidence
   of at least `0.60` and non-empty contributions.
3. `ML_RANKING_EXPERIMENT_ENABLED=true` and
   `ML_RANKING_COHORT_PERCENT` includes the user.

The checked-in synthetic artifact remains draft-only and cannot satisfy the
production read predicates.
