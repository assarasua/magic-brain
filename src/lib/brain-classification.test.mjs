import assert from "node:assert/strict";
import test from "node:test";
import {
  allocateCandidateQuantities,
  classifyBrainCandidate,
  selectInvestableCandidates,
} from "./brain-classification.ts";

test("classifies growth, recovery, and lost momentum deterministically", () => {
  assert.equal(classifyBrainCandidate(4, 12), "strong_growth");
  assert.equal(classifyBrainCandidate(3, -8), "recovery_opportunity");
  assert.equal(classifyBrainCandidate(-2, 14), "lost_momentum");
  assert.equal(classifyBrainCandidate(0, 0), "lost_momentum");
});

test("allocates only affordable growth and recovery candidates", () => {
  const candidates = [
    {
      classification: "lost_momentum",
      row: { name: "Avoid", price: "10" },
    },
    {
      classification: "strong_growth",
      row: { name: "Growth", price: "35" },
    },
    {
      classification: "recovery_opportunity",
      row: { name: "Recovery", price: "20" },
    },
    {
      classification: "strong_growth",
      row: { name: "Too expensive", price: "80" },
    },
  ];

  const selected = selectInvestableCandidates(candidates, 60, 5);

  assert.deepEqual(
    selected.map((candidate) => candidate.row.name),
    ["Growth", "Recovery"],
  );
  assert.ok(
    selected.every(
      (candidate) => candidate.classification !== "lost_momentum",
    ),
  );
  assert.ok(
    selected.reduce(
      (total, candidate) => total + Number(candidate.row.price),
      0,
    ) <= 60,
  );
});

test("uses the chosen budget for quantities and reports remaining cash", () => {
  const result = allocateCandidateQuantities(
    [
      { score: 80, row: { price: "40" } },
      { score: 20, row: { price: "25" } },
    ],
    200,
  );

  assert.deepEqual(
    result.positions.map(({ quantity }) => quantity),
    [3, 2],
  );
  assert.equal(result.invested, 170);
  assert.equal(result.unallocated, 30);
  assert.equal(result.invested + result.unallocated, 200);
});
