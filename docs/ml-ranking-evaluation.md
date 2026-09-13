# Offline ranking baseline

This phase compares the existing balanced-risk ranking formula with a small,
interpretable logistic regression. It is offline only: the generated registry
record remains `draft`, no score is written to PostgreSQL, and no request path
loads the model.

## Reproduce the fixture evaluation

Requirements are the repository's existing Node.js 22 runtime. No ML package or
new runtime dependency is required.

```sh
npm run ml:evaluate
```

The command deterministically rebuilds these versioned files:

- `artifacts/ml-ranking/ranking-logistic-v1-<dataset>.json`: coefficients,
  preprocessing statistics, seed, and training metadata;
- `artifacts/ml-ranking/ranking-logistic-v1-<dataset>.metadata.json`: a row-shaped
  representation compatible with `app_ml_model_versions`, including the
  artifact SHA-256; and
- `artifacts/ml-ranking/ranking-logistic-v1-<dataset>.evaluation.json`: dataset identity,
  folds, metrics, methodology, and promotion checks.

The synthetic fixture contains eight scoring dates and 18 cards per date. It
intentionally includes nullable features and one missing exact-date label. Its
purpose is to make chronology, missing-data handling, metrics, artifact hashing,
and model determinism testable without a database. Its outcomes are constructed
and are not evidence of market performance.

The model version includes the first 12 hexadecimal characters of the dataset
digest, so a real-data fit cannot silently replace a fixture or earlier fit.

## Methodology

Each fold trains on earlier scoring dates only. A row is eligible for training
only when its phase-1 `label_cutoff_date` is on or before the test date. This
means even the 30-day target waits for the contract's full 90-day outcome window
to mature. All cards on a scoring date stay together.

The learned target is whether the exact-calendar-date 30-day return is positive.
The model uses momentum, volatility, drawdown, price, history coverage,
staleness, card age, Reserved List status, and rarity. Numeric medians,
standardization values, and missing-value indicators are fit independently
inside each training fold. Logistic coefficients and per-row feature
contributions remain directly inspectable. Training uses the fixed seed
`20260913`; ranking ties use ascending Scryfall ID.

The deterministic comparator is the current balanced-risk formula from
`src/lib/brain.ts`:

```text
0.55 * momentum_30d + 0.32 * momentum_7d
  - 0.32 * abs(momentum_7d - momentum_30d / 4)
```

Null momentum is treated as zero only for that existing comparator. The learned
pipeline imputes from each training fold and adds explicit missing indicators.
No outcome field is a feature.

Metrics are macro-averaged over walk-forward dates:

- **Precision@10:** positive exact-date 30-day outcomes among labeled top-ten
  recommendations.
- **NDCG@10:** return-weighted ranking quality, with negative returns clipped to
  zero gain.
- **Hit rate:** fraction of folds whose first ranked card has a positive
  30-day return.
- **Downside rate:** fraction of labeled top-ten cards with a 90-day downside
  of at least 10%.
- **Coverage:** fraction with an available exact-date 30-day label. Missing
  labels are excluded from metric denominators, never converted to zero.
- **Calibration:** Brier score and ten-bin expected calibration error for the
  learned probability. Calibration is `null` for the non-probabilistic
  deterministic score.
- **Mean net return:** top-ten 30-day return after a fixed 2% conservative
  transaction-cost assumption.

## Synthetic fixture result

For dataset
`sha256:baefdf1ff3c39439db187eec6214f970d1d8f93e78fa3f49353cac18b3227aa7`,
six folds evaluate 108 candidates at 99.07% label coverage.

The deterministic baseline records Precision@10 `0.3333`, NDCG@10 `0.2555`,
hit rate `0.5000`, downside rate `0.7333`, and mean net return `-0.0891`.
The learned fixture model records Precision@10 `0.6333`, NDCG@10 `0.9689`, hit
rate `1.0000`, downside rate `0.4667`, mean net return `0.0293`, Brier score
`0.1200`, and calibration error `0.1225`.

These fixture metrics only demonstrate that the evaluator can recover the
fixture's known relationship. They must not be presented as evidence that the
learned model beats the production baseline.

## Optional real-data evaluation

Migration `014_ml_data_contract.sql` must already have been applied and populated
by a separate point-in-time feature job. These commands only read the database
and write local files; they do not migrate or deploy:

```sh
DATABASE_URL='postgresql://…' npm run ml:export-real
npm run ml:evaluate-real
```

`ml:export-real` reads `DATABASE_URL` (or `.env.local` through the npm script),
does not print it, and writes a mode-`0600` local dataset. Do not commit the
real-data export; remove it after evaluation if it contains sensitive
operational data.

## Promotion criteria

A real-data run is merely eligible for human review when all checks pass:

1. at least three valid walk-forward folds across representative regimes;
2. at least 95% exact-date 30-day label coverage;
3. learned Precision@10 and NDCG@10 are both strictly above baseline; and
4. learned downside rate is no more than two percentage points above baseline.

Synthetic runs are always `not_eligible`. Passing a real-data run does not mark
the model `ready`; reviewers must also verify set/regime stability, calibration,
data quality, and the content-addressed artifact.

## Constraints for the serving phase

- Verify the artifact bytes against `artifact_sha256` before loading.
- Register the exact feature and label versions and preserve the training
  cutoff and ranking policy.
- Reproduce the same preprocessing and feature order; unknown rarity maps to
  `rarity=other`.
- Enforce affordability, concentration, stale-price, and insufficient-history
  constraints outside the probability model.
- Return source date, model version, confidence, and at least one contribution.
- Fall back to the current deterministic score when an artifact, feature, or
  batch score is unavailable.
- Keep labels physically inaccessible to feature and request-time queries.
