# ML evaluation and monitoring

This operator-only foundation measures ranking quality and serving health
without enabling the ranking experiment, promoting a model, deploying, or
changing customer-facing ML UX. It reuses versioned score rows, point-in-time
features and labels, and allowlisted feedback events.

## Reproducible report

After migration `017_ml_evaluation_monitoring.sql` is applied through the normal
release process, generate a bounded JSON report:

```sh
DATABASE_URL='postgresql://…' npm run ml:report -- \
  --as-of 2026-09-13 \
  --window-days 30 \
  --baseline-days 30 \
  --evaluation artifacts/ml-ranking/real/<model>.evaluation.json \
  --output artifacts/ml-evaluation/report-2026-09-13.json
```

`--as-of` should always be supplied for a reproducible operational run.
Windows are limited to 90 days and row-returning queries to 100,000 rows.
Override the lower cap with `--max-rows`; it cannot exceed 100,000. The output
records all parameters and a `queryTruncated` flag. Reports may contain
pseudonymous user IDs in their inputs even though output is aggregate, so local
files are mode `0600` and should not be committed.

The machine-readable `ml-evaluation-report-v1` document includes:

- Precision@10, NDCG@10, hit rate, downside rate, coverage, and net return from
  the supplied versioned walk-forward evaluation;
- a clearly labeled served-candidate re-ranking diagnostic that is never used
  as promotion evidence because persisted scores contain a model-selected slate;
- ten-bin calibration, Brier score, and expected calibration error;
- engagement rates by attributed model or deterministic/unattributed cohort;
- rank-score population stability index over explicit current/reference
  windows;
- ML-eligible fallback ratio, fallback reasons, and score freshness; and
- draft promotion gates with `available`, `insufficient_data`, `unavailable`,
  `passed`, `failed`, or `disabled` states.

Feedback rates are observational. They must not be described as causal lift
unless assignment is randomized and the experiment analysis is separately
validated. Missing outcomes are coverage gaps, never zero returns.

## Minimum samples and draft thresholds

The checked-in defaults require three ranking groups, 100 calibration rows,
100 impressions per engagement cohort, 100 observations in each drift window,
and 100 ML-eligible serving events. Below those levels, metrics are
`insufficient_data`; empty inputs are `unavailable`.

Promotion gates are disabled by default. `--evaluate-gates` calculates draft
operator evidence only when `--evaluation` is a real-data walk-forward report;
synthetic or missing evaluations leave all gates disabled. It never updates the
model registry. Current draft thresholds are:

- model Precision@10 and NDCG@10 strictly beat the deterministic baseline;
- downside rate increases by no more than two percentage points;
- expected calibration error is at most 10%;
- rank-score PSI is at most 0.20;
- at least 95% of served ML scores are no more than 36 hours old; and
- no more than 5% of ML-assigned requests fall back.

An evaluated report still requires human review and the existing real-data
artifact promotion process. Online engagement is intentionally not an
automatic promotion gate until a powered randomized experiment exists.

## Serving telemetry

Brain Signals writes one allowlisted serving decision per request. Cohorts are
explicitly `off`, `control`, or `ml`; sources are `deterministic` or
`ml_batch`. ML-assigned fallback is therefore distinct from experiment-off and
control traffic. The table stores score provenance and an allowlisted fallback
reason only. It does not store request payloads, IP addresses, user agents,
search text, or identity attributes, and user deletion cascades.

The serving path treats telemetry as best effort so monitoring storage cannot
make recommendations unavailable. Alert on persistent report gaps separately.

## Still deferred

Customer-facing explanations, personalized feed placement, smart alerts,
preference controls, and an A/B test are the next roadmap phase. Public
probabilities or return ranges remain blocked until real-data calibration and
coverage thresholds are agreed and sustained.
