import {
  CARD_COLORS,
  CARD_RARITIES,
  CARD_TYPES,
  normalizeSetCodes,
} from "@/lib/card-filters";

export type UserPreferences = {
  defaultBudget: number;
  maxCardPrice: number;
  positions: number;
  risk: "preservation" | "conservative" | "balanced" | "growth" | "aggressive";
  horizon: "short" | "medium" | "long";
  strategy: "diversified" | "momentum" | "stability" | "collectible";
  marketTrend: "any" | "rising" | "stable" | "recovering";
  releaseEra: "any" | "classic" | "established" | "recent";
  colors: string[];
  rarities: string[];
  cardTypes: string[];
  setCodes: string[];
  reservedOnly: boolean;
};

export const defaultUserPreferences: UserPreferences = {
  defaultBudget: 1000,
  maxCardPrice: 250,
  positions: 10,
  risk: "balanced",
  horizon: "medium",
  strategy: "diversified",
  marketTrend: "any",
  releaseEra: "any",
  colors: [],
  rarities: ["rare", "mythic"],
  cardTypes: [],
  setCodes: [],
  reservedOnly: false,
};

const allowed = {
  risk: ["preservation", "conservative", "balanced", "growth", "aggressive"],
  horizon: ["short", "medium", "long"],
  strategy: ["diversified", "momentum", "stability", "collectible"],
  marketTrend: ["any", "rising", "stable", "recovering"],
  releaseEra: ["any", "classic", "established", "recent"],
  colors: CARD_COLORS,
  rarities: CARD_RARITIES,
  cardTypes: CARD_TYPES,
} as const;

const choice = <T extends string>(
  value: unknown,
  values: readonly T[],
  fallback: T,
) => (typeof value === "string" && values.includes(value as T) ? value as T : fallback);

const choices = (value: unknown, values: readonly string[]) =>
  Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === "string" && values.includes(item)))]
    : [];

const boundedNumber = (
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
) => {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(maximum, Math.max(minimum, parsed))
    : fallback;
};

export function normalizeUserPreferences(input: unknown): UserPreferences {
  const value = input && typeof input === "object"
    ? input as Record<string, unknown>
    : {};

  return {
    defaultBudget: boundedNumber(value.defaultBudget, 1000, 25, 1_000_000),
    maxCardPrice: boundedNumber(value.maxCardPrice, 250, 2, 1_000_000),
    positions: Math.round(boundedNumber(value.positions, 10, 3, 20)),
    risk: choice(value.risk, allowed.risk, "balanced"),
    horizon: choice(value.horizon, allowed.horizon, "medium"),
    strategy: choice(value.strategy, allowed.strategy, "diversified"),
    marketTrend: choice(value.marketTrend, allowed.marketTrend, "any"),
    releaseEra: choice(value.releaseEra, allowed.releaseEra, "any"),
    colors: choices(value.colors, allowed.colors),
    rarities: choices(value.rarities, allowed.rarities),
    cardTypes: choices(value.cardTypes, allowed.cardTypes),
    setCodes: normalizeSetCodes(value.setCodes),
    reservedOnly: value.reservedOnly === true,
  };
}
