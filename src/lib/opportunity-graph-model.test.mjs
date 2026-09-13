import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOpportunityGraph,
  classifyOpportunity,
  opportunitySimilarity,
} from "./opportunity-graph-model.ts";

const candidate = (overrides = {}) => ({
  id: "00000000-0000-4000-8000-000000000001",
  name: "Alpha",
  setCode: "set",
  setName: "Test Set",
  collectorNumber: "1",
  rarity: "rare",
  typeLine: "Legendary Creature — Wizard",
  imageUrl: null,
  price: 20,
  change7d: 4,
  change30d: 12,
  reserved: false,
  ...overrides,
});

test("classifies opportunity signals at deterministic thresholds", () => {
  assert.equal(classifyOpportunity(4, 12), "strong_growth");
  assert.equal(classifyOpportunity(4, -8), "recovery_opportunity");
  assert.equal(classifyOpportunity(1, 3), "stable_value");
  assert.equal(classifyOpportunity(-5, -14), "lost_momentum");
});

test("ranks matching signals and traits above unrelated cards", () => {
  const graph = buildOpportunityGraph([
    candidate(),
    candidate({
      id: "00000000-0000-4000-8000-000000000002",
      name: "Beta",
      change7d: 4.5,
      change30d: 13,
    }),
    candidate({
      id: "00000000-0000-4000-8000-000000000003",
      name: "Gamma",
      setCode: "other",
      rarity: "common",
      typeLine: "Sorcery",
      change7d: -20,
      change30d: -35,
    }),
  ]);
  const [alpha, beta, gamma] = graph.nodes;

  assert.ok(
    opportunitySimilarity(alpha, beta).score >
      opportunitySimilarity(alpha, gamma).score,
  );
  assert.ok(opportunitySimilarity(alpha, beta).reasons.includes("same opportunity"));
});

test("produces stable positions and links regardless of input order", () => {
  const cards = [
    candidate(),
    candidate({
      id: "00000000-0000-4000-8000-000000000002",
      name: "Beta",
      change7d: 3,
    }),
    candidate({
      id: "00000000-0000-4000-8000-000000000003",
      name: "Gamma",
      change7d: -2,
      change30d: 2,
    }),
    candidate({
      id: "00000000-0000-4000-8000-000000000004",
      name: "Delta",
      change7d: -8,
      change30d: -20,
    }),
  ];

  assert.deepEqual(
    buildOpportunityGraph(cards),
    buildOpportunityGraph([...cards].reverse()),
  );
});

test("connects every node to its explainable nearest neighbours", () => {
  const graph = buildOpportunityGraph(
    Array.from({ length: 6 }, (_, index) =>
      candidate({
        id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        name: `Card ${index}`,
        change7d: index - 2,
        change30d: index * 2,
      }),
    ),
    2,
  );

  assert.equal(graph.nodes.length, 6);
  assert.ok(graph.links.length >= 6);
  assert.ok(graph.links.every((link) => link.reasons.length > 0));
  assert.equal(
    graph.clusters.reduce((total, cluster) => total + cluster.count, 0),
    6,
  );
});
