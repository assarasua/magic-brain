export const CARD_COLORS = ["W", "U", "B", "R", "G"] as const;
export const CARD_RARITIES = [
  "common",
  "uncommon",
  "rare",
  "mythic",
] as const;
export const CARD_TYPES = [
  "Creature",
  "Artifact",
  "Enchantment",
  "Land",
  "Planeswalker",
  "Instant",
  "Sorcery",
] as const;

export const SET_CODE_PATTERN = /^[a-z0-9_]{1,20}$/;
export const MAX_SELECTED_SETS = 20;

export function normalizeSetCodes(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().toLowerCase())
        .filter((item) => SET_CODE_PATTERN.test(item)),
    ),
  ].slice(0, MAX_SELECTED_SETS);
}
