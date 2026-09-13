export type OpportunityClassification =
  | "strong_growth"
  | "recovery_opportunity"
  | "stable_value"
  | "lost_momentum";

export type OpportunityGraphCandidate = {
  id: string;
  name: string;
  setCode: string;
  setName: string;
  collectorNumber: string;
  rarity: string;
  typeLine: string;
  imageUrl: string | null;
  price: number;
  change7d: number;
  change30d: number;
  reserved: boolean;
};

export type OpportunityGraphNode = OpportunityGraphCandidate & {
  classification: OpportunityClassification;
  risk: "low" | "medium" | "high";
  stability: number;
  opportunityScore: number;
  x: number;
  y: number;
};

export type OpportunityGraphLink = {
  source: string;
  target: string;
  similarity: number;
  reasons: string[];
};

export type OpportunityGraph = {
  nodes: OpportunityGraphNode[];
  links: OpportunityGraphLink[];
  clusters: Array<{
    id: OpportunityClassification;
    label: string;
    count: number;
    x: number;
    y: number;
  }>;
};

const CLUSTERS: Array<{
  id: OpportunityClassification;
  label: string;
  x: number;
  y: number;
}> = [
  { id: "strong_growth", label: "Strong growth", x: 250, y: 205 },
  { id: "recovery_opportunity", label: "Recovery", x: 750, y: 205 },
  { id: "stable_value", label: "Stable value", x: 250, y: 555 },
  { id: "lost_momentum", label: "Cooling", x: 750, y: 555 },
];

const clamp = (value: number, minimum = 0, maximum = 1) =>
  Math.max(minimum, Math.min(maximum, value));

const stableHash = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

export function classifyOpportunity(
  change7d: number,
  change30d: number,
): OpportunityClassification {
  if (Math.abs(change7d) <= 2.5 && Math.abs(change30d) <= 7.5) {
    return "stable_value";
  }
  if (change7d > 0.75 && change30d > 1.5) return "strong_growth";
  if (change7d > 0.75 && change30d <= 1.5) return "recovery_opportunity";
  return "lost_momentum";
}

const cardTraits = (typeLine: string) =>
  new Set(
    typeLine
      .toLowerCase()
      .replace(/[—–]/g, " ")
      .split(/[^a-z]+/)
      .filter((part) => part.length > 2),
  );

const traitSimilarity = (left: string, right: string) => {
  const a = cardTraits(left);
  const b = cardTraits(right);
  const union = new Set([...a, ...b]);
  if (!union.size) return 0;
  return [...a].filter((trait) => b.has(trait)).length / union.size;
};

const riskValue = (node: Pick<OpportunityGraphNode, "risk">) =>
  ({ low: 0, medium: 0.5, high: 1 })[node.risk];

export function opportunitySimilarity(
  left: OpportunityGraphNode,
  right: OpportunityGraphNode,
) {
  const factors = [
    {
      label: "same opportunity",
      value: left.classification === right.classification ? 1 : 0,
      weight: 0.32,
    },
    {
      label: "similar momentum",
      value:
        1 -
        clamp(
          (Math.abs(left.change7d - right.change7d) +
            Math.abs(left.change30d - right.change30d) / 2) /
            60,
        ),
      weight: 0.24,
    },
    {
      label: "similar risk",
      value: 1 - Math.abs(riskValue(left) - riskValue(right)),
      weight: 0.18,
    },
    {
      label: "same rarity",
      value: left.rarity === right.rarity ? 1 : 0,
      weight: 0.1,
    },
    {
      label: "shared card type",
      value: traitSimilarity(left.typeLine, right.typeLine),
      weight: 0.1,
    },
    {
      label: "same set",
      value: left.setCode === right.setCode ? 1 : 0,
      weight: 0.06,
    },
  ];
  const score = factors.reduce(
    (total, factor) => total + factor.value * factor.weight,
    0,
  );
  const reasons = factors
    .filter((factor) => factor.value >= 0.65)
    .sort(
      (leftFactor, rightFactor) =>
        rightFactor.value * rightFactor.weight -
        leftFactor.value * leftFactor.weight,
    )
    .slice(0, 3)
    .map((factor) => factor.label);
  return {
    score: Math.round(score * 100),
    reasons: reasons.length ? reasons : ["closest weighted profile"],
  };
}

const makeNode = (
  card: OpportunityGraphCandidate,
  clusterIndex: number,
): OpportunityGraphNode => {
  const classification = classifyOpportunity(card.change7d, card.change30d);
  const center = CLUSTERS.find((cluster) => cluster.id === classification)!;
  const volatility = Math.abs(card.change7d - card.change30d / 4);
  const stability = Math.round(clamp(1 - volatility / 28) * 100);
  const risk = volatility < 5 ? "low" : volatility < 13 ? "medium" : "high";
  const momentum = clamp((card.change7d + card.change30d / 4 + 18) / 45);
  const scarcity = card.reserved ? 1 : card.rarity === "mythic" ? 0.75 : card.rarity === "rare" ? 0.5 : 0.2;
  const opportunityScore = Math.round(
    clamp(momentum * 0.55 + (stability / 100) * 0.3 + scarcity * 0.15) * 100,
  );
  const hash = stableHash(card.id);
  const angle = ((hash % 360) * Math.PI) / 180 + clusterIndex * 2.399963;
  const radius = 42 + ((hash >>> 9) % 145);

  return {
    ...card,
    classification,
    risk,
    stability,
    opportunityScore,
    x: Math.round(center.x + Math.cos(angle) * radius),
    y: Math.round(center.y + Math.sin(angle) * radius * 0.72),
  };
};

export function buildOpportunityGraph(
  candidates: OpportunityGraphCandidate[],
  neighboursPerNode = 3,
): OpportunityGraph {
  const clusterCounts = new Map<OpportunityClassification, number>();
  const nodes = [...candidates]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((card) => {
      const classification = classifyOpportunity(card.change7d, card.change30d);
      const index = clusterCounts.get(classification) ?? 0;
      clusterCounts.set(classification, index + 1);
      return makeNode(card, index);
    });

  const links = new Map<string, OpportunityGraphLink>();
  for (const source of nodes) {
    nodes
      .filter((target) => target.id !== source.id)
      .map((target) => ({ target, ...opportunitySimilarity(source, target) }))
      .sort(
        (left, right) =>
          right.score - left.score || left.target.id.localeCompare(right.target.id),
      )
      .slice(0, Math.max(1, neighboursPerNode))
      .forEach(({ target, score, reasons }) => {
        const ids = [source.id, target.id].sort();
        const key = ids.join(":");
        const existing = links.get(key);
        if (!existing || score > existing.similarity) {
          links.set(key, {
            source: ids[0],
            target: ids[1],
            similarity: score,
            reasons,
          });
        }
      });
  }

  return {
    nodes,
    links: [...links.values()].sort(
      (left, right) =>
        right.similarity - left.similarity ||
        `${left.source}:${left.target}`.localeCompare(`${right.source}:${right.target}`),
    ),
    clusters: CLUSTERS.map((cluster) => ({
      ...cluster,
      count: clusterCounts.get(cluster.id) ?? 0,
    })),
  };
}
