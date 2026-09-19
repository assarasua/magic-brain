import { ApiError, assertOnlyParameters, encodeCursor, parseInteger } from "./core";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const rulingLimit = 50;
const candidateLimit = 10;

export type RulesQuery = <T extends Record<string, unknown>>(
  sql: string,
  values?: unknown[],
) => Promise<{ rows: T[] }>;

type SourceDescriptor = {
  provider: string;
  url: string;
  updatedAt: string;
  fetchedAt: string;
  sha256: string;
  format?: "json" | "jsonl" | "jsonl-gzip";
  checksumScope?: "downloaded-bytes";
};

type DatasetRow = {
  id: string;
  imported_at: string;
  oracle_source: SourceDescriptor;
  rulings_source: SourceDescriptor;
  card_count: number;
  effect_count: number;
  ruling_count: number;
};

type CardFace = {
  faceIndex: number;
  name: string;
  typeLine: string | null;
  manaCost: string | null;
  oracleText: string | null;
  power: string | null;
  toughness: string | null;
  loyalty: string | null;
  defense: string | null;
};

type OracleCardRow = {
  match_priority: number;
  oracle_id: string;
  scryfall_id: string;
  name: string;
  layout: string;
  type_line: string;
  oracle_text: string | null;
  mana_cost: string | null;
  keywords: string[];
  faces: CardFace[];
  source_url: string;
};

type EffectRow = {
  face_index: number;
  effect_index: number;
  text: string;
};

type SearchRow = EffectRow & {
  oracle_id: string;
  name: string;
  source_url: string;
};

type RulingRow = {
  source: "wotc" | "scryfall";
  published_at: string;
  comment: string;
};

type EffectCursor = {
  datasetId: string;
  q: string;
  oracleId: string;
  faceIndex: string;
  effectIndex: string;
};

export type CardEffectsOptions = {
  query: string;
  limit: number;
  cursor: EffectCursor | null;
};

function assertSingleParameters(params: URLSearchParams, allowed: readonly string[]) {
  assertOnlyParameters(params, allowed);
  for (const name of allowed) {
    if (params.getAll(name).length > 1) {
      throw new ApiError(400, "invalid_parameter", `${name} must appear only once`);
    }
  }
}

function requiredText(params: URLSearchParams, name: string, min: number, max: number) {
  const value = params.get(name)?.trim() ?? "";
  if (value.includes("\u0000")) {
    throw new ApiError(400, "invalid_parameter", `${name} must not contain NUL characters`);
  }
  if (value.length < min || value.length > max) {
    throw new ApiError(
      400,
      "invalid_parameter",
      `${name} must be between ${min} and ${max} characters`,
    );
  }
  return value;
}

export function parseCardRulesParameters(params: URLSearchParams) {
  assertSingleParameters(params, ["card"]);
  return { card: requiredText(params, "card", 1, 200) };
}

function invalidCursor() {
  return new ApiError(
    400,
    "invalid_cursor",
    "cursor is invalid, belongs to another search, or its dataset is no longer available; restart the search without cursor",
  );
}

function parseEffectCursor(value: string | null, search: string): EffectCursor | null {
  if (value === null) return null;
  try {
    if (!value || value.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(value)) {
      throw invalidCursor();
    }
    const bytes = Buffer.from(value, "base64url");
    if (bytes.toString("base64url") !== value) throw invalidCursor();
    const parsed = JSON.parse(bytes.toString("utf8")) as Record<string, unknown>;
    const keys = ["v", "datasetId", "q", "oracleId", "faceIndex", "effectIndex"];
    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed) ||
      Object.keys(parsed).length !== keys.length ||
      keys.some((key) => !Object.hasOwn(parsed, key)) ||
      parsed.v !== 1 ||
      parsed.q !== search ||
      typeof parsed.datasetId !== "string" ||
      !uuidPattern.test(parsed.datasetId) ||
      typeof parsed.oracleId !== "string" ||
      !uuidPattern.test(parsed.oracleId) ||
      [parsed.faceIndex, parsed.effectIndex].some(
        (index) => typeof index !== "string" || !/^(0|[1-9]\d{0,9})$/.test(index) || Number(index) > 2_147_483_647,
      )
    ) {
      throw invalidCursor();
    }
    return parsed as EffectCursor;
  } catch {
    throw invalidCursor();
  }
}

export function parseCardEffectsParameters(params: URLSearchParams): CardEffectsOptions {
  assertSingleParameters(params, ["q", "limit", "cursor"]);
  const query = requiredText(params, "q", 2, 200);
  return {
    query,
    limit: parseInteger(params.get("limit"), "limit", { defaultValue: 20, min: 1, max: 50 }),
    cursor: parseEffectCursor(params.get("cursor"), query),
  };
}

function mapSource(row: DatasetRow) {
  return {
    datasetId: row.id,
    importedAt: new Date(row.imported_at).toISOString(),
    oracle: row.oracle_source,
    rulings: row.rulings_source,
    cardCount: row.card_count,
    effectCount: row.effect_count,
    rulingCount: row.ruling_count,
  };
}

function unavailableDataset() {
  return new ApiError(
    503,
    "card_rules_unavailable",
    "Card rules have not been imported. Apply database migrations and run npm run db:sync-card-rules to activate a complete Oracle and rulings dataset.",
  );
}

export function createCardRulesReader(query: RulesQuery) {
  async function readDataset(datasetId?: string) {
    let result;
    try {
      result = await query<DatasetRow>(
        `select id::text, imported_at::text, oracle_source, rulings_source,
                card_count, effect_count, ruling_count
         from app_rules_datasets
         where ${datasetId ? "id = $1::uuid" : "is_active = true"}
         limit 1`,
        datasetId ? [datasetId] : [],
      );
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "42P01") {
        throw unavailableDataset();
      }
      throw error;
    }
    if (!result.rows[0]) {
      throw datasetId ? invalidCursor() : unavailableDataset();
    }
    return result.rows[0];
  }

  async function getCardRules(card: string) {
    const dataset = await readDataset();
    const isIdentifier = uuidPattern.test(card);
    const identifierMatch = isIdentifier
      ? `or c.oracle_id = $2::uuid or c.scryfall_id = $2::uuid
         or c.oracle_id in (select p.oracle_id from cards p where p.scryfall_id = $2::uuid)`
      : "";
    const matchPriority = isIdentifier ? "0" : "case when lower(c.name) = lower($2) then 0 else 1 end";
    const candidates = await query<OracleCardRow>(
      `select c.oracle_id::text, c.scryfall_id::text, c.name, c.layout,
              c.type_line, c.oracle_text, c.mana_cost, c.keywords, c.faces, c.source_url,
              ${matchPriority} as match_priority
       from app_oracle_cards c
       where c.dataset_id = $1::uuid
         and (lower(c.name) = lower($2)
              or exists (select 1 from jsonb_array_elements(c.faces) face
                         where lower(face->>'name') = lower($2))
              ${identifierMatch})
       order by match_priority, lower(c.name), c.oracle_id
       limit ${candidateLimit + 1}`,
      [dataset.id, card],
    );
    // The bounded query puts full-name matches first. A face is a fallback, so an
    // art-series face cannot make a unique playable card's full name ambiguous.
    const bestPriority = candidates.rows[0]?.match_priority;
    const matches = candidates.rows.filter((row) => row.match_priority === bestPriority);
    if (matches.length === 0) {
      throw new ApiError(404, "card_not_found", "No exact card or face name, Oracle ID, or known printing ID matched the imported rules dataset.");
    }
    if (matches.length > 1) {
      throw new ApiError(
        409,
        "ambiguous_card",
        "More than one card matches. Retry with a candidate Oracle ID.",
        {
          candidates: matches.slice(0, candidateLimit).map((row) => ({ oracleId: row.oracle_id, name: row.name })),
          candidatesTruncated: matches.length > candidateLimit,
        },
      );
    }
    const row = matches[0];
    // Both reads use the selected immutable dataset, including during an import activation.
    const [effects, rulings] = await Promise.all([
      query<EffectRow>(
        `select face_index, effect_index, text from app_card_effects
         where dataset_id = $1::uuid and oracle_id = $2::uuid
         order by face_index, effect_index`,
        [dataset.id, row.oracle_id],
      ),
      query<RulingRow>(
        `select source, published_at::text, comment from app_card_rulings
         where dataset_id = $1::uuid and oracle_id = $2::uuid
         order by published_at desc, ruling_index
         limit ${rulingLimit + 1}`,
        [dataset.id, row.oracle_id],
      ),
    ]);
    return {
      card: {
        oracleId: row.oracle_id,
        scryfallId: row.scryfall_id,
        name: row.name,
        layout: row.layout,
        typeLine: row.type_line,
        oracleText: row.oracle_text,
        manaCost: row.mana_cost,
        keywords: row.keywords,
        faces: row.faces,
        sourceUrl: row.source_url,
        // These paragraphs are verbatim reference text, never executable instructions.
        effects: effects.rows.map((effect) => ({
          faceIndex: effect.face_index,
          effectIndex: effect.effect_index,
          text: effect.text,
        })),
        rulings: rulings.rows.slice(0, rulingLimit).map((ruling) => ({
          source: ruling.source,
          publishedAt: ruling.published_at,
          comment: ruling.comment,
        })),
        rulingsTruncated: rulings.rows.length > rulingLimit,
      },
      source: mapSource(dataset),
    };
  }

  async function searchCardEffects(options: CardEffectsOptions) {
    const dataset = await readDataset(options.cursor?.datasetId);
    const values: unknown[] = [dataset.id, options.query];
    let after = "";
    if (options.cursor) {
      values.push(options.cursor.oracleId, Number(options.cursor.faceIndex), Number(options.cursor.effectIndex));
      after = "and (e.oracle_id, e.face_index, e.effect_index) > ($3::uuid, $4::integer, $5::integer)";
    }
    values.push(options.limit + 1);
    const result = await query<SearchRow>(
      `select e.oracle_id::text, c.name, e.face_index, e.effect_index, e.text, c.source_url
       from app_card_effects e
       join app_oracle_cards c on c.dataset_id = e.dataset_id and c.oracle_id = e.oracle_id
       cross join (select plainto_tsquery('english', $2) as terms) search
       where e.dataset_id = $1::uuid
         and (to_tsvector('english', e.text) @@ search.terms
              or to_tsvector('english', c.name || ' ' || array_to_string(c.keywords, ' ')) @@ search.terms)
         ${after}
       order by e.oracle_id, e.face_index, e.effect_index
       limit $${values.length}`,
      values,
    );
    const rows = result.rows.slice(0, options.limit);
    const last = rows.at(-1);
    return {
      data: {
        results: rows.map((row) => ({
          oracleId: row.oracle_id,
          name: row.name,
          faceIndex: row.face_index,
          effectIndex: row.effect_index,
          text: row.text,
          sourceUrl: row.source_url,
        })),
        source: mapSource(dataset),
      },
      pagination: {
        limit: options.limit,
        nextCursor: result.rows.length > options.limit && last
          ? encodeCursor({
              datasetId: dataset.id,
              q: options.query,
              oracleId: last.oracle_id,
              faceIndex: String(last.face_index),
              effectIndex: String(last.effect_index),
            })
          : null,
      },
    };
  }

  return { getCardRules, searchCardEffects };
}
