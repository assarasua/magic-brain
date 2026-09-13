export const MAX_PORTFOLIO_LISTS = 50;
export const MAX_PORTFOLIO_LIST_NAME_LENGTH = 80;
export const MAX_BULK_HOLDINGS = 200;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isUuid = (value: unknown): value is string =>
  typeof value === "string" && uuidPattern.test(value);

export function parseListName(value: unknown) {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/\s+/g, " ");
  return name.length >= 1 &&
    name.length <= MAX_PORTFOLIO_LIST_NAME_LENGTH &&
    !/[\u0000-\u001f\u007f]/.test(name)
    ? name
    : null;
}

export function parseHoldingIds(value: unknown) {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > MAX_BULK_HOLDINGS
  ) {
    return null;
  }
  const ids = value.filter(
    (id): id is number => Number.isSafeInteger(id) && id > 0,
  );
  return ids.length === value.length && new Set(ids).size === ids.length
    ? ids
    : null;
}

export type PortfolioBulkRequest = {
  action: "move" | "copy" | "delete";
  holdingIds: number[];
  sourceListId: string;
  destinationListId?: string;
  requestId: string;
};

export function parsePortfolioBulkRequest(
  value: unknown,
): PortfolioBulkRequest | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).some(
      (key) =>
        ![
          "action",
          "holdingIds",
          "sourceListId",
          "destinationListId",
          "requestId",
        ].includes(key),
    ) ||
    (record.action !== "move" &&
      record.action !== "copy" &&
      record.action !== "delete") ||
    !isUuid(record.requestId) ||
    !isUuid(record.sourceListId)
  ) {
    return null;
  }
  const holdingIds = parseHoldingIds(record.holdingIds);
  if (!holdingIds) return null;
  if (
    record.action !== "delete" &&
    !isUuid(record.destinationListId)
  ) {
    return null;
  }
  if (
    record.action === "delete" &&
    record.destinationListId !== undefined
  ) {
    return null;
  }
  return {
    action: record.action,
    holdingIds,
    sourceListId: record.sourceListId,
    requestId: record.requestId,
    ...(record.action === "delete"
      ? {}
      : { destinationListId: record.destinationListId as string }),
  };
}
