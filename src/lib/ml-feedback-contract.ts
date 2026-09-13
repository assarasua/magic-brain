export const ML_FEEDBACK_EVENT_TYPES = [
  "impression",
  "open_details",
  "save_to_watchlist",
  "dismiss",
  "add_to_portfolio",
  "alert_action",
] as const;

export const ML_FEEDBACK_SURFACES = [
  "brain_signals",
  "predict",
  "discover",
  "watchlist",
  "portfolio",
  "daily_news",
  "opportunity_graph",
  "alert",
] as const;

export type MlFeedbackEventType = typeof ML_FEEDBACK_EVENT_TYPES[number];
export type MlFeedbackSurface = typeof ML_FEEDBACK_SURFACES[number];
export type MlAlertAction = "open" | "dismiss" | "save";

export type MlFeedbackEvent = {
  eventId: string;
  eventType: MlFeedbackEventType;
  surface: MlFeedbackSurface;
  cardId: string;
  occurredAt: string;
  scoreId: string | null;
  modelVersion: string | null;
  rankPosition: number | null;
  alertAction: MlAlertAction | null;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MODEL_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const MAX_EVENT_AGE_MS = 180 * 86_400_000;
const MAX_FUTURE_SKEW_MS = 5 * 60_000;
const REQUIRED_KEYS = [
  "eventId",
  "eventType",
  "surface",
  "cardId",
  "occurredAt",
] as const;
const OPTIONAL_KEYS = [
  "scoreId",
  "modelVersion",
  "rankPosition",
  "alertAction",
] as const;
const ALLOWED_KEYS = new Set<string>([...REQUIRED_KEYS, ...OPTIONAL_KEYS]);

const isChoice = <T extends string>(
  value: unknown,
  choices: readonly T[],
): value is T => typeof value === "string" && choices.includes(value as T);

export function parseMlFeedbackEvent(
  input: unknown,
  now = new Date(),
): MlFeedbackEvent | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (
    Object.keys(value).some((key) => !ALLOWED_KEYS.has(key)) ||
    REQUIRED_KEYS.some((key) => !Object.hasOwn(value, key)) ||
    typeof value.eventId !== "string" ||
    !UUID_PATTERN.test(value.eventId) ||
    typeof value.cardId !== "string" ||
    !UUID_PATTERN.test(value.cardId) ||
    !isChoice(value.eventType, ML_FEEDBACK_EVENT_TYPES) ||
    !isChoice(value.surface, ML_FEEDBACK_SURFACES) ||
    typeof value.occurredAt !== "string" ||
    !ISO_TIMESTAMP_PATTERN.test(value.occurredAt)
  ) {
    return null;
  }

  const occurredAtMs = Date.parse(value.occurredAt);
  if (
    !Number.isFinite(occurredAtMs) ||
    new Date(occurredAtMs).toISOString().slice(0, 10) !==
      value.occurredAt.slice(0, 10) ||
    occurredAtMs < now.getTime() - MAX_EVENT_AGE_MS ||
    occurredAtMs > now.getTime() + MAX_FUTURE_SKEW_MS
  ) {
    return null;
  }

  const scoreId = value.scoreId ?? null;
  const modelVersion = value.modelVersion ?? null;
  const rankPosition = value.rankPosition ?? null;
  const alertAction = value.alertAction ?? null;
  if (
    (scoreId !== null &&
      (typeof scoreId !== "string" || !UUID_PATTERN.test(scoreId))) ||
    (modelVersion !== null &&
      (typeof modelVersion !== "string" ||
        !MODEL_VERSION_PATTERN.test(modelVersion))) ||
    (rankPosition !== null &&
      (typeof rankPosition !== "number" ||
        !Number.isInteger(rankPosition) ||
        rankPosition < 1 ||
        rankPosition > 500)) ||
    (alertAction !== null &&
      !isChoice(alertAction, ["open", "dismiss", "save"] as const))
  ) {
    return null;
  }

  if (
    (value.eventType === "alert_action") !== (alertAction !== null) ||
    (value.eventType === "alert_action" && value.surface !== "alert")
  ) {
    return null;
  }

  return {
    eventId: value.eventId.toLowerCase(),
    eventType: value.eventType,
    surface: value.surface,
    cardId: value.cardId.toLowerCase(),
    occurredAt: new Date(occurredAtMs).toISOString(),
    scoreId: scoreId?.toLowerCase() ?? null,
    modelVersion,
    rankPosition,
    alertAction,
  };
}
