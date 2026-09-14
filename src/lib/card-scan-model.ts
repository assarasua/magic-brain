import type { CardLanguage } from "@/lib/card-languages";

export const MAX_OCR_TEXT_LENGTH = 160;
export const MAX_SCAN_HINT_LENGTH = 24;

export const OCR_LANGUAGE_MODELS: Record<CardLanguage, string> = {
  en: "eng",
  es: "spa",
  fr: "fra",
  de: "deu",
  it: "ita",
  pt: "por",
  ja: "jpn",
  ko: "kor",
  ru: "rus",
  zhs: "chi_sim",
  zht: "chi_tra",
};

export type CardScanHints = {
  text: string;
  language: CardLanguage;
  setCode?: string;
  collectorNumber?: string;
};

export type CardScanMatchReason =
  | "exact_print"
  | "collector_match"
  | "name_match";

export function normalizeMatchConfidence(
  value: number,
  reason: CardScanMatchReason,
) {
  const bounded = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  if (reason === "exact_print") return Math.max(0.9, bounded);
  if (reason === "collector_match") return Math.max(0.65, bounded);
  return bounded;
}

export const normalizeOcrText = (value: string, max = MAX_OCR_TEXT_LENGTH) =>
  value
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[^\p{L}\p{N}\s'’.,:/#&+\-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

export const normalizeSetCode = (value: string) => {
  const normalized = value.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]/g, "");
  return normalized.length >= 2 && normalized.length <= 8 ? normalized : undefined;
};

export const normalizeCollectorNumber = (value: string) => {
  const normalized = value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9★*+\-/]/g, "")
    .replace(/^[/+\-]+|[/+\-]+$/g, "")
    .slice(0, MAX_SCAN_HINT_LENGTH);
  return normalized || undefined;
};

export function parseCollectorHints(text: string) {
  const normalized = normalizeOcrText(text);
  const collectorMatch = normalized.match(
    /(?:collector|card|no\.?|n[º°]|#)\s*([a-z0-9★*+\-]+)(?:\s*\/\s*[a-z0-9]+)?/i,
  );
  const ratioMatch = normalized.match(/\b([a-z]?\d+[a-z★*+]?)\s*\/\s*\d+\b/i);
  const setMatch = normalized.match(/\b(?:set|edici[oó]n)\s*[:#-]?\s*([a-z0-9]{2,8})\b/i);
  return {
    collectorNumber: normalizeCollectorNumber(
      collectorMatch?.[1] ?? ratioMatch?.[1] ?? "",
    ),
    setCode: normalizeSetCode(setMatch?.[1] ?? ""),
  };
}

export function parseIdentifyRequest(value: unknown): CardScanHints | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).some(
      (key) => !["text", "language", "setCode", "collectorNumber"].includes(key),
    ) ||
    typeof record.text !== "string" ||
    record.text.length > MAX_OCR_TEXT_LENGTH * 4 ||
    typeof record.language !== "string" ||
    !Object.hasOwn(OCR_LANGUAGE_MODELS, record.language)
  ) {
    return null;
  }
  const text = normalizeOcrText(record.text);
  const setCode =
    record.setCode === undefined || typeof record.setCode === "string"
      ? normalizeSetCode(record.setCode ?? "")
      : undefined;
  const collectorNumber =
    record.collectorNumber === undefined || typeof record.collectorNumber === "string"
      ? normalizeCollectorNumber(record.collectorNumber ?? "")
      : undefined;
  if (!text && !collectorNumber) return null;
  return {
    text,
    language: record.language as CardLanguage,
    ...(setCode ? { setCode } : {}),
    ...(collectorNumber ? { collectorNumber } : {}),
  };
}
