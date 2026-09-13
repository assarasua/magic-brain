export const MAX_IMPORT_ROWS = 500;
export const MAX_IMPORT_TEXT_LENGTH = 500_000;
const MAX_QUANTITY = 1_000_000;
const MAX_UNIT_PRICE = 999_999_999_999.99;

const isValidQuantity = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= 1 &&
  value <= MAX_QUANTITY;

const isValidUnitPrice = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= MAX_UNIT_PRICE &&
  Math.abs(value * 100 - Math.round(value * 100)) < 1e-7;

export type PortfolioImportSource = "moxfield" | "deckstats" | "csv" | "text";

export type PortfolioImportRow = {
  row: number;
  quantity: number;
  name: string;
  setCode?: string;
  collectorNumber?: string;
  purchasePrice: number;
  condition: "near_mint" | "excellent" | "good" | "light_played";
  language:
    | "en"
    | "es"
    | "fr"
    | "de"
    | "it"
    | "pt"
    | "ja"
    | "ko"
    | "ru"
    | "zhs"
    | "zht";
  acquiredAt?: string;
};

export type PortfolioImportParseResult = {
  rows: PortfolioImportRow[];
  errors: Array<{ row: number; message: string }>;
};

export type ConfirmedPortfolioImportRow = Omit<
  PortfolioImportRow,
  "row" | "name" | "setCode" | "collectorNumber"
> & {
  cardId: string;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const normalizeHeader = (value: string) =>
  value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");

const aliases = {
  quantity: ["quantity", "qty", "count", "amount", "copies"],
  name: ["name", "cardname", "card", "card_name"],
  setCode: ["setcode", "set", "edition", "set_id", "set_code"],
  collectorNumber: [
    "collectornumber",
    "collector",
    "cardnumber",
    "number",
    "collector_number",
  ],
  purchasePrice: [
    "purchaseprice",
    "pricepaid",
    "buyprice",
    "purchase_price",
    "price",
  ],
  condition: ["condition"],
  language: ["language", "lang"],
  acquiredAt: ["acquiredat", "dateadded", "purchasedate", "date_added"],
} as const;

function findColumn(headers: string[], names: readonly string[]) {
  const normalizedNames = new Set(names.map(normalizeHeader));
  return headers.findIndex((header) => normalizedNames.has(normalizeHeader(header)));
}

function parseCsvRecords(input: string) {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }
    if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      record.push(field);
      field = "";
    } else if (character === "\n") {
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else if (character !== "\r") {
      field += character;
    }
  }
  if (quoted) throw new Error("Unclosed quoted field");
  if (field.length > 0 || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records.filter((candidate) =>
    candidate.some((value) => value.trim().length > 0),
  );
}

const languageAliases: Record<string, PortfolioImportRow["language"]> = {
  en: "en",
  english: "en",
  es: "es",
  spanish: "es",
  español: "es",
  fr: "fr",
  french: "fr",
  français: "fr",
  de: "de",
  german: "de",
  deutsch: "de",
  it: "it",
  italian: "it",
  italiano: "it",
  pt: "pt",
  portuguese: "pt",
  português: "pt",
  ja: "ja",
  japanese: "ja",
  ko: "ko",
  korean: "ko",
  ru: "ru",
  russian: "ru",
  zhs: "zhs",
  "simplified chinese": "zhs",
  zht: "zht",
  "traditional chinese": "zht",
};

const conditionAliases: Record<string, PortfolioImportRow["condition"]> = {
  nm: "near_mint",
  "near mint": "near_mint",
  nearmint: "near_mint",
  near_mint: "near_mint",
  mint: "near_mint",
  excellent: "excellent",
  ex: "excellent",
  good: "good",
  gd: "good",
  lp: "light_played",
  "light played": "light_played",
  lightlyplayed: "light_played",
  light_played: "light_played",
};

function parsePrice(raw: string | undefined) {
  if (!raw?.trim()) return 0;
  const normalized = raw
    .trim()
    .replace(/[€$£]/g, "")
    .replace(/\s/g, "")
    .replace(",", ".");
  return Number(normalized);
}

function parseDate(raw: string | undefined) {
  if (!raw?.trim()) return undefined;
  const value = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (
    !Number.isFinite(timestamp) ||
    new Date(timestamp).toISOString().slice(0, 10) !== value
  ) {
    return null;
  }
  return value;
}

function buildRow(
  row: number,
  values: {
    quantity?: string;
    name?: string;
    setCode?: string;
    collectorNumber?: string;
    purchasePrice?: string;
    condition?: string;
    language?: string;
    acquiredAt?: string;
  },
): { row?: PortfolioImportRow; error?: string } {
  const quantity = Number((values.quantity ?? "1").trim());
  const name = (values.name ?? "").trim();
  const purchasePrice = parsePrice(values.purchasePrice);
  const conditionValue = values.condition?.trim().toLowerCase();
  const languageValue = values.language?.trim().toLowerCase();
  const condition = conditionValue
    ? conditionAliases[conditionValue]
    : "near_mint";
  const language = languageValue ? languageAliases[languageValue] : "en";
  const acquiredAt = parseDate(values.acquiredAt);

  if (!name) return { error: "Card name is required" };
  if (!isValidQuantity(quantity)) {
    return { error: "Quantity must be a positive whole number" };
  }
  if (!isValidUnitPrice(purchasePrice)) {
    return { error: "Purchase price must be non-negative with up to 2 decimals" };
  }
  if (!condition) return { error: `Unsupported condition: ${values.condition}` };
  if (!language) return { error: `Unsupported language: ${values.language}` };
  if (acquiredAt === null) return { error: "Date must use YYYY-MM-DD" };

  return {
    row: {
      row,
      quantity,
      name,
      setCode: values.setCode?.trim().toLowerCase() || undefined,
      collectorNumber: values.collectorNumber?.trim() || undefined,
      purchasePrice,
      condition,
      language,
      acquiredAt,
    },
  };
}

export function parsePortfolioCsv(input: string): PortfolioImportParseResult {
  if (input.length > MAX_IMPORT_TEXT_LENGTH) {
    return { rows: [], errors: [{ row: 0, message: "File is too large" }] };
  }
  let records: string[][];
  try {
    records = parseCsvRecords(input.replace(/^\uFEFF/, ""));
  } catch (error) {
    return {
      rows: [],
      errors: [{ row: 0, message: (error as Error).message }],
    };
  }
  if (records.length < 2) {
    return {
      rows: [],
      errors: [{ row: 0, message: "CSV needs a header and at least one row" }],
    };
  }
  const headers = records[0];
  const columns = Object.fromEntries(
    Object.entries(aliases).map(([key, names]) => [
      key,
      findColumn(headers, names),
    ]),
  ) as Record<keyof typeof aliases, number>;
  if (columns.name < 0) {
    return {
      rows: [],
      errors: [{ row: 1, message: "No card-name column was found" }],
    };
  }
  if (records.length - 1 > MAX_IMPORT_ROWS) {
    return {
      rows: [],
      errors: [
        { row: 0, message: `Imports are limited to ${MAX_IMPORT_ROWS} rows` },
      ],
    };
  }

  const result: PortfolioImportParseResult = { rows: [], errors: [] };
  records.slice(1).forEach((record, index) => {
    const value = (column: keyof typeof aliases) =>
      columns[column] >= 0 ? record[columns[column]] : undefined;
    const parsed = buildRow(index + 2, {
      quantity: value("quantity"),
      name: value("name"),
      setCode: value("setCode"),
      collectorNumber: value("collectorNumber"),
      purchasePrice: value("purchasePrice"),
      condition: value("condition"),
      language: value("language"),
      acquiredAt: value("acquiredAt"),
    });
    if (parsed.row) result.rows.push(parsed.row);
    if (parsed.error) result.errors.push({ row: index + 2, message: parsed.error });
  });
  return result;
}

const ignoredTextHeaders = new Set([
  "deck",
  "sideboard",
  "commander",
  "companion",
  "maybeboard",
  "mainboard",
]);

export function parsePortfolioText(input: string): PortfolioImportParseResult {
  if (input.length > MAX_IMPORT_TEXT_LENGTH) {
    return { rows: [], errors: [{ row: 0, message: "Text is too large" }] };
  }
  const lines = input.split(/\r?\n/);
  if (lines.length > MAX_IMPORT_ROWS + 50) {
    return {
      rows: [],
      errors: [
        { row: 0, message: `Imports are limited to ${MAX_IMPORT_ROWS} card rows` },
      ],
    };
  }
  const result: PortfolioImportParseResult = { rows: [], errors: [] };
  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || ignoredTextHeaders.has(line.toLowerCase())) {
      return;
    }
    const quantityMatch = line.match(/^(\d+)\s*x?\s+(.+)$/i);
    if (!quantityMatch) {
      result.errors.push({
        row: index + 1,
        message: "Expected “quantity card name”",
      });
      return;
    }
    const quantity = quantityMatch[1];
    let remainder = quantityMatch[2].trim();
    let setCode: string | undefined;
    let collectorNumber: string | undefined;

    const prefixSet = remainder.match(/^\[([a-z0-9]+)\]\s+(.+)$/i);
    if (prefixSet) {
      setCode = prefixSet[1];
      remainder = prefixSet[2].trim();
    } else {
      const arenaPrinting = remainder.match(
        /^(.+?)\s+\(([a-z0-9]+)\)(?:\s+([a-z0-9★]+))?$/i,
      );
      if (arenaPrinting) {
        remainder = arenaPrinting[1].trim();
        setCode = arenaPrinting[2];
        collectorNumber = arenaPrinting[3];
      }
    }

    const parsed = buildRow(index + 1, {
      quantity,
      name: remainder,
      setCode,
      collectorNumber,
    });
    if (parsed.row) result.rows.push(parsed.row);
    if (parsed.error) result.errors.push({ row: index + 1, message: parsed.error });
  });
  if (result.rows.length > MAX_IMPORT_ROWS) {
    return {
      rows: [],
      errors: [
        { row: 0, message: `Imports are limited to ${MAX_IMPORT_ROWS} rows` },
      ],
    };
  }
  return result;
}

export function parsePortfolioImport(
  input: string,
  format: "csv" | "text",
): PortfolioImportParseResult {
  return format === "csv" ? parsePortfolioCsv(input) : parsePortfolioText(input);
}

export function validateConfirmedImport(
  value: unknown,
): ConfirmedPortfolioImportRow[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_IMPORT_ROWS) {
    return null;
  }
  const rows: ConfirmedPortfolioImportRow[] = [];
  for (const item of value) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      return null;
    }
    const record = item as Record<string, unknown>;
    const allowedKeys = new Set([
      "cardId",
      "quantity",
      "purchasePrice",
      "condition",
      "language",
      "acquiredAt",
    ]);
    const acquiredAt = parseDate(
      typeof record.acquiredAt === "string" ? record.acquiredAt : undefined,
    );
    if (
      Object.keys(record).some((key) => !allowedKeys.has(key)) ||
      typeof record.cardId !== "string" ||
      !uuidPattern.test(record.cardId) ||
      !isValidQuantity(record.quantity) ||
      !isValidUnitPrice(record.purchasePrice) ||
      !Object.values(conditionAliases).includes(
        record.condition as PortfolioImportRow["condition"],
      ) ||
      !Object.values(languageAliases).includes(
        record.language as PortfolioImportRow["language"],
      ) ||
      acquiredAt === null
    ) {
      return null;
    }
    rows.push({
      cardId: record.cardId,
      quantity: record.quantity,
      purchasePrice: record.purchasePrice,
      condition: record.condition as PortfolioImportRow["condition"],
      language: record.language as PortfolioImportRow["language"],
      acquiredAt,
    });
  }
  return rows;
}

export function validatePreviewImport(value: unknown): PortfolioImportRow[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_IMPORT_ROWS) {
    return null;
  }
  const rows: PortfolioImportRow[] = [];
  for (const item of value) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      return null;
    }
    const record = item as Record<string, unknown>;
    const allowedKeys = new Set([
      "row",
      "quantity",
      "name",
      "setCode",
      "collectorNumber",
      "purchasePrice",
      "condition",
      "language",
      "acquiredAt",
    ]);
    const acquiredAt = parseDate(
      typeof record.acquiredAt === "string" ? record.acquiredAt : undefined,
    );
    if (
      Object.keys(record).some((key) => !allowedKeys.has(key)) ||
      !Number.isInteger(record.row) ||
      (record.row as number) < 1 ||
      !isValidQuantity(record.quantity) ||
      typeof record.name !== "string" ||
      record.name.trim().length < 1 ||
      record.name.length > 200 ||
      (record.setCode !== undefined &&
        (typeof record.setCode !== "string" || record.setCode.length > 20)) ||
      (record.collectorNumber !== undefined &&
        (typeof record.collectorNumber !== "string" ||
          record.collectorNumber.length > 30)) ||
      !isValidUnitPrice(record.purchasePrice) ||
      !Object.values(conditionAliases).includes(
        record.condition as PortfolioImportRow["condition"],
      ) ||
      !Object.values(languageAliases).includes(
        record.language as PortfolioImportRow["language"],
      ) ||
      acquiredAt === null
    ) {
      return null;
    }
    rows.push({
      row: record.row as number,
      quantity: record.quantity,
      name: record.name.trim(),
      setCode:
        typeof record.setCode === "string"
          ? record.setCode.trim().toLowerCase()
          : undefined,
      collectorNumber:
        typeof record.collectorNumber === "string"
          ? record.collectorNumber.trim()
          : undefined,
      purchasePrice: record.purchasePrice,
      condition: record.condition as PortfolioImportRow["condition"],
      language: record.language as PortfolioImportRow["language"],
      acquiredAt,
    });
  }
  return rows;
}

export function consolidateConfirmedImport(
  rows: ConfirmedPortfolioImportRow[],
): ConfirmedPortfolioImportRow[] | null {
  const consolidated = new Map<string, ConfirmedPortfolioImportRow>();
  for (const row of rows) {
    const key = [
      row.cardId,
      row.purchasePrice.toFixed(2),
      row.condition,
      row.language,
      row.acquiredAt ?? "",
    ].join("\u0000");
    const previous = consolidated.get(key);
    const quantity = (previous?.quantity ?? 0) + row.quantity;
    if (!isValidQuantity(quantity)) return null;
    consolidated.set(key, { ...row, quantity });
  }
  return [...consolidated.values()];
}
