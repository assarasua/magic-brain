# Predict methodology

Predict is a scenario-analysis tool for Magic: The Gathering sets. It does not
forecast a guaranteed price or tell users to buy or sell.

## Inputs

Users choose a 12, 24, or 36-month horizon and one comparison target:

- **Match inflation:** illustrative 3% annual growth
- **Match S&P 500:** illustrative 8% annual growth
- **Extreme risk & reward:** illustrative 20% annual growth

These fixed rates make scenarios comparable. They are not live inflation data,
an S&P 500 forecast, or expected investment returns.

Users also score expected demand, supply scarcity, and resilience to reprints
from 1 to 5. These are explicit assumptions, not observed facts.

## Market evidence

For released sets with sufficient MTGJSON observations, the model considers:

- median 90-day card return;
- the percentage of tracked cards with a positive 90-day return;
- average 90-day price dispersion; and
- price coverage relative to the set's stated card count.

For unreleased sets, including announced crossover products, market evidence is
unavailable. Predict therefore starts from a neutral market score, assigns low
confidence, widens the scenario range, and identifies the result as assumption
driven.

## Outputs

The score is a 0–100 relative scenario score. The bear, base, and bull values
show a range rather than a point estimate. “Target probability” is a model
heuristic based on the distance between the scenario midpoint and the selected
benchmark; it is not a statistically calibrated probability.

Card markets can be illiquid, prices can be stale or manipulated, reprints can
change supply abruptly, and transaction costs are not included. Predictions
must not be presented as financial advice or guaranteed returns.
