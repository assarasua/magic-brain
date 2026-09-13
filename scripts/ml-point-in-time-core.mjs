import { createHash } from "node:crypto";

export const FEATURE_VERSION = "v1";
export const LABEL_VERSION = "v1";
const DAY_MS = 86_400_000;
const SOURCE_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/;

export function isoDate(value, name = "date") {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${name} must be an ISO calendar date`);
  }
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== value) {
    throw new Error(`${name} must be an ISO calendar date`);
  }
  return value;
}

export function addDays(value, days) {
  isoDate(value);
  return new Date(Date.parse(`${value}T00:00:00.000Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

export function daysBetween(left, right) {
  return (Date.parse(`${right}T00:00:00.000Z`) - Date.parse(`${left}T00:00:00.000Z`)) / DAY_MS;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function checksum(value) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

export function metadataRevision(card, availableAt, provenance) {
  const revision = {
    scryfallId: card.scryfallId,
    availableAt: isoDate(availableAt, "metadata available date"),
    provenance,
    releasedAt: card.releasedAt ?? null,
    rarity: card.rarity ?? null,
    cardType: card.cardType ?? null,
    isReserved: card.isReserved ?? null,
  };
  return {
    ...revision,
    checksum: checksum({
      scryfallId: revision.scryfallId,
      provenance,
      releasedAt: revision.releasedAt,
      rarity: revision.rarity,
      cardType: revision.cardType,
      isReserved: revision.isReserved,
    }),
  };
}

function positivePrices(prices, source) {
  const seen = new Set();
  return prices
    .filter((price) => price.source === source)
    .map((price) => {
      isoDate(price.date, "price date");
      if (seen.has(price.date)) throw new Error(`Duplicate ${source} price date: ${price.date}`);
      seen.add(price.date);
      return price;
    })
    .filter((price) => Number.isFinite(price.eur) && price.eur > 0)
    .sort((left, right) => left.date.localeCompare(right.date));
}

function latestAtOrBefore(prices, date) {
  return prices.filter((price) => price.date <= date).at(-1) ?? null;
}

function volatility(prices) {
  if (prices.length < 2) return null;
  const returns = prices.slice(1).map((price, index) => Math.log(price.eur / prices[index].eur));
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  return round(Math.sqrt(returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / returns.length));
}

function round(value) {
  return Number(value.toFixed(8));
}

export function buildFeature({ card, metadataRevisions, prices, asOfDate, priceSource }) {
  isoDate(asOfDate, "as-of date");
  if (!SOURCE_PATTERN.test(priceSource)) throw new Error("Invalid price source");
  const revision = [...metadataRevisions]
    .filter((value) => value.availableAt <= asOfDate)
    .sort((left, right) => left.availableAt.localeCompare(right.availableAt))
    .at(-1);
  if (!revision) throw new Error("No metadata revision was available on the scoring date");
  if (revision.releasedAt && revision.releasedAt > asOfDate) {
    throw new Error("Card was unreleased on the scoring date");
  }
  const eligible = positivePrices(prices, priceSource).filter((price) => price.date <= asOfDate);
  const current = eligible.at(-1);
  if (!current) throw new Error("No positive point-in-time price is available");
  const momentum = (days) => {
    const reference = latestAtOrBefore(eligible, addDays(asOfDate, -days));
    return reference ? round(current.eur / reference.eur - 1) : null;
  };
  const prices30 = eligible.filter((price) => price.date >= addDays(asOfDate, -30));
  const prices90 = eligible.filter((price) => price.date >= addDays(asOfDate, -90));
  const feature = {
    featureContractVersion: FEATURE_VERSION,
    scryfallId: card.scryfallId,
    asOfDate,
    priceSource,
    metadataAvailableAt: revision.availableAt,
    sourceMaxPriceDate: current.date,
    priceEur: current.eur,
    momentum7d: momentum(7),
    momentum30d: momentum(30),
    momentum90d: momentum(90),
    volatility30d: volatility(prices30),
    drawdown90d: round(current.eur / Math.max(...prices90.map((price) => price.eur)) - 1),
    historyDays: daysBetween(eligible[0].date, current.date),
    observations90d: prices90.length,
    priceStalenessDays: daysBetween(current.date, asOfDate),
    cardAgeDays: revision.releasedAt ? daysBetween(revision.releasedAt, asOfDate) : null,
    rarity: revision.rarity,
    cardType: revision.cardType,
    isReserved: revision.isReserved,
  };
  return { ...feature, producerChecksum: checksum(feature) };
}

export function buildLabels(feature, prices, throughDate) {
  isoDate(throughDate, "label through date");
  const cutoff = addDays(feature.asOfDate, 90);
  if (cutoff > throughDate) throw new Error("Outcome labels have not matured");
  const future = positivePrices(prices, feature.priceSource)
    .filter((price) => price.date > feature.asOfDate && price.date <= cutoff);
  const byDate = new Map(future.map((price) => [price.date, price.eur]));
  const futureReturn = (days) => {
    const value = byDate.get(addDays(feature.asOfDate, days));
    return value === undefined ? null : round(value / feature.priceEur - 1);
  };
  const values = {
    labelContractVersion: LABEL_VERSION,
    asOfDate: feature.asOfDate,
    labelCutoffDate: cutoff,
    sourceMinFutureDate: future.at(0)?.date ?? null,
    sourceMaxFutureDate: future.at(-1)?.date ?? null,
    return7d: futureReturn(7),
    return30d: futureReturn(30),
    return90d: futureReturn(90),
    downside90d: future.length
      ? round(Math.min(0, ...future.map((price) => price.eur / feature.priceEur - 1)))
      : null,
    realizedVolatility90d: volatility([{ date: feature.asOfDate, eur: feature.priceEur }, ...future]),
  };
  const labels = {
    ...values,
    has7dPrice: values.return7d !== null,
    has30dPrice: values.return30d !== null,
    has90dPrice: values.return90d !== null,
  };
  return { ...labels, producerChecksum: checksum(labels) };
}

function integer(value, name, { min = 1, max } = {}) {
  if (!/^\d+$/.test(value ?? "")) throw new Error(`${name} must be an integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || (max !== undefined && parsed > max)) {
    throw new Error(`${name} must be between ${min} and ${max}`);
  }
  return parsed;
}

export function parseArguments(argv, today = new Date().toISOString().slice(0, 10)) {
  const command = argv[0];
  if (!["dry-run", "backfill", "daily", "mature-labels"].includes(command)) {
    throw new Error("Command must be dry-run, backfill, daily, or mature-labels");
  }
  const allowed = new Set([
    "--from", "--to", "--date", "--through", "--source", "--batch-size",
    "--chunk-days", "--date-step-days", "--max-rows", "--resume",
  ]);
  const values = {};
  for (let index = 1; index < argv.length; index += 2) {
    const flag = argv[index];
    if (!allowed.has(flag)) throw new Error(`Unknown option: ${flag}`);
    if (!argv[index + 1] || argv[index + 1].startsWith("--")) throw new Error(`${flag} requires a value`);
    if (values[flag] !== undefined) throw new Error(`Duplicate option: ${flag}`);
    values[flag] = argv[index + 1];
  }
  const source = values["--source"] ?? "mtgjson";
  if (!SOURCE_PATTERN.test(source)) throw new Error("--source is malformed");
  const options = {
    command,
    source,
    batchSize: integer(values["--batch-size"] ?? "250", "--batch-size", { max: 1000 }),
    chunkDays: integer(values["--chunk-days"] ?? "7", "--chunk-days", { max: 90 }),
    dateStepDays: integer(values["--date-step-days"] ?? "1", "--date-step-days", { max: 90 }),
    maxRows: integer(values["--max-rows"] ?? "250000", "--max-rows", { max: 5_000_000 }),
    resume: values["--resume"] ?? null,
  };
  if (
    options.resume &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(options.resume)
  ) {
    throw new Error("--resume must be a UUID");
  }
  if (command === "backfill" || command === "dry-run") {
    options.from = isoDate(values["--from"], "--from");
    options.to = isoDate(values["--to"], "--to");
    if (options.from > options.to) throw new Error("--from must not be after --to");
    if (daysBetween(options.from, options.to) > 3650) throw new Error("Date range cannot exceed 3650 days");
  } else if (command === "daily") {
    options.from = options.to = isoDate(values["--date"] ?? today, "--date");
  } else {
    options.through = isoDate(values["--through"] ?? today, "--through");
  }
  return options;
}

export function scoringDates(from, to, stepDays) {
  const dates = [];
  for (let date = from; date <= to; date = addDays(date, stepDays)) dates.push(date);
  return dates;
}
