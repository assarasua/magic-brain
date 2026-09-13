export type MlRankingReason =
  | "experiment_off"
  | "outside_cohort"
  | "scores_missing_or_stale";

export type MlRankingStatus = {
  source: "ml_batch" | "deterministic";
  reason: MlRankingReason | null;
  modelVersion: string | null;
  scoreDate: string | null;
};

export type MlDriver = {
  feature: string;
  direction: "positive" | "negative";
};

export type MlCardContext = {
  scoreId: string;
  modelVersion: string;
  score: number;
  confidence: number;
  probabilityPositive30d: number | null;
  expectedDownside90d: number | null;
  drivers: MlDriver[];
  generatedAt: string;
  scoreDate: string;
};

export type MlExperience = {
  ranking: MlRankingStatus;
  scores: Record<string, MlCardContext>;
};

export const deterministicRanking = (
  reason: MlRankingReason,
): MlRankingStatus => ({
  source: "deterministic",
  reason,
  modelVersion: null,
  scoreDate: null,
});

export function normalizeDrivers(value: unknown): MlDriver[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is { feature: string; direction: "positive" | "negative" } =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as { feature?: unknown }).feature === "string" &&
        ["positive", "negative"].includes(
          String((item as { direction?: unknown }).direction),
        ),
    )
    .slice(0, 3)
    .map(({ feature, direction }) => ({ feature, direction }));
}

export function rankByVerifiedScores<T extends { id: string }>(
  items: T[],
  experience: MlExperience,
): T[] {
  if (experience.ranking.source !== "ml_batch") return items;
  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const leftScore = experience.scores[left.item.id]?.score;
      const rightScore = experience.scores[right.item.id]?.score;
      if (leftScore === undefined && rightScore === undefined) {
        return left.index - right.index;
      }
      if (leftScore === undefined) return 1;
      if (rightScore === undefined) return -1;
      return rightScore - leftScore || left.index - right.index;
    })
    .map(({ item }) => item);
}
