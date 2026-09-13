import {
  CARD_COLORS,
  CARD_RARITIES,
  CARD_TYPES,
  MAX_SELECTED_SETS,
  SET_CODE_PATTERN,
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

const preferenceKeys = [
  "defaultBudget",
  "maxCardPrice",
  "positions",
  "risk",
  "horizon",
  "strategy",
  "marketTrend",
  "releaseEra",
  "colors",
  "rarities",
  "cardTypes",
  "setCodes",
  "reservedOnly",
] as const;

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

const isUniqueAllowedArray = (
  value: unknown,
  values: readonly string[],
  maximum = values.length,
) =>
  Array.isArray(value) &&
  value.length <= maximum &&
  value.every((item) => typeof item === "string" && values.includes(item)) &&
  new Set(value).size === value.length;

export function parseUserPreferences(input: unknown): UserPreferences | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  const keys = Object.keys(value);
  if (
    keys.length !== preferenceKeys.length ||
    !preferenceKeys.every((key) => Object.hasOwn(value, key))
  ) {
    return null;
  }

  if (
    typeof value.defaultBudget !== "number" ||
    !Number.isFinite(value.defaultBudget) ||
    value.defaultBudget < 25 ||
    value.defaultBudget > 1_000_000 ||
    typeof value.maxCardPrice !== "number" ||
    !Number.isFinite(value.maxCardPrice) ||
    value.maxCardPrice < 2 ||
    value.maxCardPrice > value.defaultBudget ||
    typeof value.positions !== "number" ||
    !Number.isInteger(value.positions) ||
    value.positions < 3 ||
    value.positions > 20 ||
    typeof value.reservedOnly !== "boolean" ||
    !allowed.risk.includes(value.risk as UserPreferences["risk"]) ||
    !allowed.horizon.includes(value.horizon as UserPreferences["horizon"]) ||
    !allowed.strategy.includes(value.strategy as UserPreferences["strategy"]) ||
    !allowed.marketTrend.includes(value.marketTrend as UserPreferences["marketTrend"]) ||
    !allowed.releaseEra.includes(value.releaseEra as UserPreferences["releaseEra"]) ||
    !isUniqueAllowedArray(value.colors, allowed.colors) ||
    !isUniqueAllowedArray(value.rarities, allowed.rarities) ||
    !isUniqueAllowedArray(value.cardTypes, allowed.cardTypes) ||
    !Array.isArray(value.setCodes) ||
    value.setCodes.length > MAX_SELECTED_SETS ||
    value.setCodes.some(
      (code) => typeof code !== "string" || !SET_CODE_PATTERN.test(code),
    ) ||
    new Set(value.setCodes).size !== value.setCodes.length
  ) {
    return null;
  }

  return value as UserPreferences;
}
