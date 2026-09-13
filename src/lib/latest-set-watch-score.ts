export type LatestSetWatchScoreInput = {
  momentum7d: number | null;
  momentum30d: number | null;
  stabilityPercent: number | null;
  drawdownPercent: number | null;
  historyDays: number;
  observationCount: number;
  rarity: string;
};

export type LatestSetWatchScore = {
  total: number;
  components: {
    momentum7d: number;
    momentum30d: number;
    stability: number;
    drawdown: number;
    history: number;
    rarity: number;
    confidence: number;
  };
  confidence: "high" | "medium" | "low";
  risk: "high" | "medium" | "low";
  trend: "accelerating" | "rising" | "steady" | "falling";
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const scale = (
  value: number | null,
  minimum: number,
  maximum: number,
  points: number,
) => {
  if (value === null) return 0;
  return clamp((value - minimum) / (maximum - minimum), 0, 1) * points;
};

const rarityPoints: Record<string, number> = {
  common: 1,
  uncommon: 2,
  rare: 4,
  mythic: 5,
  special: 3,
  bonus: 3,
};

export function scoreLatestSetPick(
  input: LatestSetWatchScoreInput,
): LatestSetWatchScore {
  const historyRatio = clamp(input.historyDays / 30, 0, 1);
  const observationRatio = clamp(input.observationCount / 25, 0, 1);
  const dataConfidence = historyRatio * 0.55 + observationRatio * 0.45;
  const components = {
    momentum7d: scale(input.momentum7d, -10, 25, 18),
    momentum30d: scale(input.momentum30d, -15, 50, 22),
    stability:
      input.stabilityPercent === null
        ? 0
        : (1 - clamp(input.stabilityPercent / 25, 0, 1)) * 20,
    drawdown:
      input.drawdownPercent === null
        ? 0
        : (1 - clamp(Math.abs(Math.min(input.drawdownPercent, 0)) / 35, 0, 1)) * 15,
    history: historyRatio * 10,
    rarity: rarityPoints[input.rarity.toLowerCase()] ?? 1,
    confidence: dataConfidence * 10,
  };
  const total = Math.round(
    Object.values(components).reduce((sum, value) => sum + value, 0),
  );

  const risk =
    input.historyDays < 14 ||
    input.stabilityPercent === null ||
    input.stabilityPercent > 18 ||
    (input.drawdownPercent ?? -100) < -20
      ? "high"
      : input.historyDays < 25 ||
          input.stabilityPercent > 10 ||
          (input.drawdownPercent ?? -100) < -10
        ? "medium"
        : "low";

  const trend =
    input.momentum7d !== null &&
    input.momentum30d !== null &&
    input.momentum7d >= 5 &&
    input.momentum7d > input.momentum30d * 0.45
      ? "accelerating"
      : (input.momentum7d ?? input.momentum30d ?? 0) >= 2
        ? "rising"
        : (input.momentum7d ?? input.momentum30d ?? 0) <= -2
          ? "falling"
          : "steady";

  return {
    total,
    components: Object.fromEntries(
      Object.entries(components).map(([key, value]) => [
        key,
        Math.round(value * 10) / 10,
      ]),
    ) as LatestSetWatchScore["components"],
    confidence:
      dataConfidence >= 0.8 ? "high" : dataConfidence >= 0.5 ? "medium" : "low",
    risk,
    trend,
  };
}
