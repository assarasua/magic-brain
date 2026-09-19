const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_CARDS = 150_000;
export const MAX_RULINGS = 1_000_000;

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function text(value, label, { nullable = false, max = 40_000 } = {}) {
  if (nullable && (value === undefined || value === null)) return null;
  if (typeof value !== "string" || value.length > max || value.includes("\u0000")) {
    throw new Error(`${label} must be a string of at most ${max} characters without NUL bytes`);
  }
  return value;
}

function requiredText(value, label, max = 1_000) {
  const result = text(value, label, { max });
  if (!result.trim()) throw new Error(`${label} must not be empty`);
  return result;
}

function uuid(value, label) {
  if (typeof value !== "string" || !UUID.test(value)) {
    throw new Error(`${label} must be a UUID`);
  }
  return value.toLowerCase();
}

function date(value, label) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} must be a valid YYYY-MM-DD date`);
  }
  return value;
}

function faceOf(value, index, label) {
  const face = object(value, label);
  return {
    faceIndex: index,
    name: requiredText(face.name, `${label}.name`),
    typeLine: text(face.type_line, `${label}.type_line`, { nullable: true, max: 1_000 }),
    manaCost: text(face.mana_cost, `${label}.mana_cost`, { nullable: true, max: 1_000 }),
    oracleText: text(face.oracle_text, `${label}.oracle_text`, { nullable: true }),
    power: text(face.power, `${label}.power`, { nullable: true, max: 100 }),
    toughness: text(face.toughness, `${label}.toughness`, { nullable: true, max: 100 }),
    loyalty: text(face.loyalty, `${label}.loyalty`, { nullable: true, max: 100 }),
    defense: text(face.defense, `${label}.defense`, { nullable: true, max: 100 }),
  };
}

function sourceUrl(value, id, label) {
  if (value === undefined) return `https://api.scryfall.com/cards/${id}`;
  const raw = requiredText(value, label, 2_000);
  let url;
  try { url = new URL(raw); } catch { throw new Error(`${label} must be an official Scryfall HTTPS URL`); }
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
      !["scryfall.com", "api.scryfall.com"].includes(url.hostname)) {
    throw new Error(`${label} must be an official Scryfall HTTPS URL`);
  }
  return raw;
}

function cardOf(value, index) {
  const label = `Card ${index + 1}`;
  const card = object(value, label);
  const oracleId = uuid(card.oracle_id, `${label}.oracle_id`);
  const scryfallId = uuid(card.id, `${label}.id`);
  const name = requiredText(card.name, `${label}.name`);
  const layout = requiredText(card.layout, `${label}.layout`, 100);
  let faces;
  if (card.card_faces !== undefined) {
    if (!Array.isArray(card.card_faces) || card.card_faces.length < 1 || card.card_faces.length > 10) {
      throw new Error(`${label}.card_faces must contain 1–10 faces`);
    }
    faces = card.card_faces.map((face, faceIndex) => faceOf(face, faceIndex, `${label}.card_faces[${faceIndex}]`));
  } else {
    faces = [faceOf(card, 0, label)];
  }
  const typeLine = text(card.type_line, `${label}.type_line`, { nullable: true, max: 1_000 })
    ?? faces.map((face) => face.typeLine).filter(Boolean).join(" // ");
  const keywords = card.keywords ?? [];
  if (!Array.isArray(keywords) || keywords.length > 100) throw new Error(`${label}.keywords must be an array of at most 100 strings`);
  const normalizedKeywords = [...new Set(keywords.map((keyword, keywordIndex) => requiredText(keyword, `${label}.keywords[${keywordIndex}]`, 200)))];
  return {
    oracleId,
    scryfallId,
    name,
    layout,
    typeLine,
    oracleText: text(card.oracle_text, `${label}.oracle_text`, { nullable: true }),
    manaCost: text(card.mana_cost, `${label}.mana_cost`, { nullable: true, max: 1_000 }),
    keywords: normalizedKeywords,
    faces,
    sourceUrl: sourceUrl(card.scryfall_uri, scryfallId, `${label}.scryfall_uri`),
    searchText: [name, typeLine, card.oracle_text, ...normalizedKeywords,
      ...faces.flatMap((face) => [face.name, face.typeLine, face.oracleText])]
      .filter((value) => typeof value === "string" && value.length > 0).join("\n"),
  };
}

function canonicalContent(card) {
  const content = { ...card };
  delete content.scryfallId;
  delete content.sourceUrl;
  return JSON.stringify(content);
}

/** Preserve Oracle paragraphs verbatim. These are retrieval units, not game-engine effects. */
export function transformCardRules(oracleRecords, rulingRecords) {
  if (!Array.isArray(oracleRecords) || oracleRecords.length < 1 || oracleRecords.length > MAX_CARDS) {
    throw new Error(`Oracle cards must be an array containing 1–${MAX_CARDS} records`);
  }
  if (!Array.isArray(rulingRecords) || rulingRecords.length > MAX_RULINGS) {
    throw new Error(`Rulings must be an array containing at most ${MAX_RULINGS} records`);
  }
  const cardsById = new Map();
  let duplicateCards = 0;
  for (let index = 0; index < oracleRecords.length; index += 1) {
    const card = cardOf(oracleRecords[index], index);
    const existing = cardsById.get(card.oracleId);
    if (existing) {
      if (canonicalContent(existing) !== canonicalContent(card)) {
        throw new Error(`Conflicting Oracle records for ${card.oracleId}; use one complete oracle_cards snapshot`);
      }
      duplicateCards += 1;
      if (card.scryfallId < existing.scryfallId) cardsById.set(card.oracleId, card);
    } else {
      cardsById.set(card.oracleId, card);
    }
  }
  const cards = [...cardsById.values()].sort((a, b) => a.oracleId.localeCompare(b.oracleId));
  const effects = cards.flatMap((card) => card.faces.flatMap((face) =>
    (face.oracleText ?? "").split(/\r?\n/).filter((paragraph) => paragraph.trim().length > 0)
      .map((paragraph, effectIndex) => ({ oracleId: card.oracleId, faceIndex: face.faceIndex, effectIndex, text: paragraph })),
  ));

  const seenRulings = new Set();
  const rulings = [];
  let duplicateRulings = 0;
  let unmatchedRulings = 0;
  for (let index = 0; index < rulingRecords.length; index += 1) {
    const label = `Ruling ${index + 1}`;
    const raw = object(rulingRecords[index], label);
    const oracleId = uuid(raw.oracle_id, `${label}.oracle_id`);
    if (!["wotc", "scryfall"].includes(raw.source)) throw new Error(`${label}.source must be wotc or scryfall`);
    const publishedAt = date(raw.published_at, `${label}.published_at`);
    const comment = text(raw.comment, `${label}.comment`);
    if (!cardsById.has(oracleId)) { unmatchedRulings += 1; continue; }
    const key = JSON.stringify([oracleId, raw.source, publishedAt, comment]);
    if (seenRulings.has(key)) { duplicateRulings += 1; continue; }
    seenRulings.add(key);
    rulings.push({ oracleId, source: raw.source, publishedAt, comment });
  }
  rulings.sort((a, b) => a.oracleId.localeCompare(b.oracleId) || a.publishedAt.localeCompare(b.publishedAt) ||
    a.source.localeCompare(b.source) || a.comment.localeCompare(b.comment));
  let previousOracleId;
  let rulingIndex = 0;
  for (const ruling of rulings) {
    if (ruling.oracleId !== previousOracleId) rulingIndex = 0;
    ruling.rulingIndex = rulingIndex++;
    previousOracleId = ruling.oracleId;
  }
  return {
    cards, effects, rulings,
    counts: { cards: cards.length, effects: effects.length, rulings: rulings.length, duplicateCards, duplicateRulings, unmatchedRulings },
  };
}
