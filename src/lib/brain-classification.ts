export type BrainMarketClassification =
  | "strong_growth"
  | "recovery_opportunity"
  | "lost_momentum";

export function classifyBrainCandidate(
  change7d: number,
  change30d: number,
): BrainMarketClassification {
  if (change7d > 0 && change30d > 0) return "strong_growth";
  if (change7d > 0 && change30d <= 0) return "recovery_opportunity";
  return "lost_momentum";
}

export function selectInvestableCandidates<
  T extends {
    classification: BrainMarketClassification;
    row: { name: string; price: string | number };
  },
>(candidates: T[], budget: number, positionLimit: number): T[] {
  const names = new Set<string>();
  const selected: T[] = [];
  let baseCost = 0;

  for (const candidate of candidates) {
    if (selected.length >= positionLimit) break;
    if (candidate.classification === "lost_momentum") continue;
    const key = candidate.row.name.toLowerCase();
    const price = Number(candidate.row.price);
    if (
      !Number.isFinite(price) ||
      price <= 0 ||
      names.has(key) ||
      baseCost + price > budget
    ) {
      continue;
    }
    names.add(key);
    selected.push(candidate);
    baseCost += price;
  }

  return selected;
}

export function allocateCandidateQuantities<
  T extends { score: number; row: { price: string | number } },
>(candidates: T[], budget: number) {
  const baseCost = candidates.reduce(
    (total, candidate) => total + Number(candidate.row.price),
    0,
  );
  const additionalBudget = Math.max(0, budget - baseCost);
  const weights = candidates.map((candidate) => Math.max(candidate.score, 1));
  const totalWeight = weights.reduce((total, weight) => total + weight, 0);

  const positions = candidates.map((candidate, index) => {
    const price = Number(candidate.row.price);
    const extraShare =
      totalWeight > 0
        ? additionalBudget * (weights[index] / totalWeight)
        : 0;
    const quantity = 1 + Math.floor(extraShare / price);
    return {
      candidate,
      quantity,
      allocation: quantity * price,
    };
  });
  const invested = positions.reduce(
    (total, position) => total + position.allocation,
    0,
  );

  return {
    positions,
    invested,
    unallocated: Math.max(0, budget - invested),
  };
}
