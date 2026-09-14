import type { CardLanguage } from "@/lib/card-languages";

export const MAX_BULK_PORTFOLIO_ITEMS = 24;

export type PortfolioBatchItem = {
  clientId: string;
  cardId: string;
  quantity: number;
  purchasePrice: number;
  condition: "near_mint" | "excellent" | "good" | "light_played";
  language: CardLanguage;
  acquiredAt: string;
  listId: string;
};

const conditions = new Set<PortfolioBatchItem["condition"]>([
  "near_mint",
  "excellent",
  "good",
  "light_played",
]);
const languages = new Set<CardLanguage>([
  "en", "es", "fr", "de", "it", "pt", "ja", "ko", "ru", "zhs", "zht",
]);
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidPattern.test(value);
}

function isValidQuantity(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 1_000_000;
}

function isValidPrice(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 999_999_999_999.99;
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 10) === value;
}

export function parsePortfolioBatch(body: unknown): PortfolioBatchItem[] | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  if (
    Object.keys(record).some((key) => key !== "items") ||
    !Array.isArray(record.items) ||
    record.items.length === 0 ||
    record.items.length > MAX_BULK_PORTFOLIO_ITEMS
  ) {
    return null;
  }

  const clientIds = new Set<string>();
  const parsed: PortfolioBatchItem[] = [];
  for (const value of record.items) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const item = value as Record<string, unknown>;
    const allowed = new Set([
      "clientId",
      "cardId",
      "quantity",
      "purchasePrice",
      "condition",
      "language",
      "acquiredAt",
      "listId",
    ]);
    if (
      Object.keys(item).some((key) => !allowed.has(key)) ||
      typeof item.clientId !== "string" ||
      !isUuid(item.clientId) ||
      clientIds.has(item.clientId) ||
      typeof item.cardId !== "string" ||
      !isUuid(item.cardId) ||
      typeof item.listId !== "string" ||
      !isUuid(item.listId) ||
      !isValidQuantity(item.quantity) ||
      !isValidPrice(item.purchasePrice) ||
      typeof item.condition !== "string" ||
      !conditions.has(item.condition as PortfolioBatchItem["condition"]) ||
      typeof item.language !== "string" ||
      !languages.has(item.language as CardLanguage) ||
      !isCalendarDate(item.acquiredAt)
    ) {
      return null;
    }
    clientIds.add(item.clientId);
    parsed.push(item as PortfolioBatchItem);
  }
  return parsed;
}

export function isIdempotencyKey(value: string | null) {
  return value !== null && isUuid(value);
}
