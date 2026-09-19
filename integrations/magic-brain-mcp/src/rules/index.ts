import {
  RULES_INDEX_SCHEMA_VERSION,
  type RulesCitation,
  type RulesDocument,
  type RulesIndex,
  type RulesPosting,
  type RulesSearchHit,
  type RulesSourceMetadata,
} from "./types.js";

const TOKEN_PATTERN = /[\p{L}\p{N}]+(?:[.'’-][\p{L}\p{N}]+)*/gu;
const RULE_REFERENCE_PATTERN = /\b\d{3}(?:\.\d+)+(?:[a-z])?\b/i;

export function buildRulesIndex(
  source: RulesSourceMetadata,
  documents: RulesDocument[],
): RulesIndex {
  if (documents.length === 0) throw new Error("Cannot index an empty rules corpus");
  const postings: Record<string, RulesPosting[]> = {};
  const documentLengths: number[] = [];

  documents.forEach((document, documentIndex) => {
    const terms = tokenize(documentSearchText(document));
    documentLengths.push(terms.length);
    const frequencies = new Map<string, number>();
    for (const term of terms) {
      frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
    }
    for (const [term, termFrequency] of [...frequencies].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      (postings[term] ??= []).push({ document: documentIndex, termFrequency });
    }
  });

  return {
    schemaVersion: RULES_INDEX_SCHEMA_VERSION,
    source,
    documents,
    averageDocumentLength:
      documentLengths.reduce((sum, length) => sum + length, 0) /
      documentLengths.length,
    documentLengths,
    postings: Object.fromEntries(
      Object.entries(postings).sort(([a], [b]) => a.localeCompare(b)),
    ),
  };
}

export function searchRules(
  index: RulesIndex,
  query: string,
  options: {
    limit?: number;
    maxExcerptChars?: number;
    kinds?: Array<"rule" | "glossary">;
  } = {},
): RulesSearchHit[] {
  validateRulesIndex(index);
  const normalizedQuery = query.trim();
  if (normalizedQuery.length < 2 || normalizedQuery.length > 300) {
    throw new Error("Rules search query must contain 2-300 characters");
  }
  const limit = clampInteger(options.limit ?? 5, 1, 10);
  const maxExcerptChars = clampInteger(options.maxExcerptChars ?? 360, 80, 600);
  const terms = [...new Set(tokenize(normalizedQuery))];
  if (terms.length === 0) return [];

  const scores = new Map<number, number>();
  const totalDocuments = index.documents.length;
  const k1 = 1.2;
  const b = 0.75;
  for (const term of terms) {
    const posting = index.postings[term];
    if (!posting) continue;
    const inverseDocumentFrequency = Math.log(
      1 + (totalDocuments - posting.length + 0.5) / (posting.length + 0.5),
    );
    for (const { document, termFrequency } of posting) {
      const candidate = index.documents[document];
      if (!candidate || (options.kinds && !options.kinds.includes(candidate.kind))) {
        continue;
      }
      const length = index.documentLengths[document] ?? 0;
      const denominator =
        termFrequency +
        k1 * (1 - b + b * (length / index.averageDocumentLength));
      const score =
        inverseDocumentFrequency *
        ((termFrequency * (k1 + 1)) / denominator);
      scores.set(document, (scores.get(document) ?? 0) + score);
    }
  }

  const referencedRule = normalizedQuery.match(RULE_REFERENCE_PATTERN)?.[0];
  if (referencedRule) {
    index.documents.forEach((document, documentIndex) => {
      if (document.ruleNumber?.toLowerCase() === referencedRule.toLowerCase()) {
        scores.set(documentIndex, (scores.get(documentIndex) ?? 0) + 100);
      }
    });
  }

  return [...scores]
    .sort(
      ([leftIndex, leftScore], [rightIndex, rightScore]) =>
        rightScore - leftScore ||
        index.documents[leftIndex]!.id.localeCompare(
          index.documents[rightIndex]!.id,
        ),
    )
    .slice(0, limit)
    .map(([documentIndex, score]) => {
      const document = index.documents[documentIndex]!;
      return {
        score: Number(score.toFixed(6)),
        excerpt: boundedExcerpt(document.text, terms, maxExcerptChars),
        citation: citationFor(index, document),
      };
    });
}

/** Keep every part of a question in bounded queries, including its final clause. */
export function splitRulesQuery(value: string): string[] {
  let remaining = value.trim();
  const queries: string[] = [];
  while (remaining.length > 300) {
    const boundary = remaining.lastIndexOf(" ", 300);
    const end = boundary > 150 ? boundary : 300;
    queries.push(remaining.slice(0, end));
    remaining = remaining.slice(end).trimStart();
  }
  if (remaining.length >= 2) queries.push(remaining);
  else if (remaining && queries.length) {
    // A final single character can still matter (for example X or a rule suffix).
    const previous = queries.pop()!;
    queries.push(previous.slice(0, -2), `${previous.slice(-2)} ${remaining}`);
  }
  return queries;
}

/** Reciprocal-rank fusion gives focused queries a voice without summing raw BM25 scores. */
export function searchRuleQueries(
  index: RulesIndex,
  queries: string[],
  options: Parameters<typeof searchRules>[2] = {},
): RulesSearchHit[] {
  if (queries.length === 0 || queries.length > 24) {
    throw new Error("Provide 1-24 bounded rules queries");
  }
  const hits = new Map<string, { hit: RulesSearchHit; rank: number }>();
  for (const query of [...new Set(queries)]) {
    searchRules(index, query, options).forEach((hit, position) => {
      const key = JSON.stringify(hit.citation);
      const existing = hits.get(key);
      hits.set(key, {
        hit: existing && existing.hit.score >= hit.score ? existing.hit : hit,
        rank: (existing?.rank ?? 0) + 1 / (60 + position + 1),
      });
    });
  }
  return [...hits.entries()]
    .sort(([leftKey, left], [rightKey, right]) =>
      right.rank - left.rank || leftKey.localeCompare(rightKey))
    .slice(0, options.limit ?? 5)
    .map(([, { hit }]) => hit);
}

export function validateRulesIndex(index: RulesIndex): void {
  if (index.schemaVersion !== RULES_INDEX_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported rules index schema: ${String(index.schemaVersion)}`,
    );
  }
  if (
    index.documents.length === 0 ||
    index.documents.length !== index.documentLengths.length ||
    !Number.isFinite(index.averageDocumentLength) ||
    index.averageDocumentLength <= 0
  ) {
    throw new Error("Rules index is incomplete or corrupt");
  }
  if (!/^https:\/\/media\.wizards\.com\//.test(index.source.sourceUrl)) {
    throw new Error("Rules index source URL is not an approved Wizards URL");
  }
  if (!/^[a-f0-9]{64}$/.test(index.source.sha256)) {
    throw new Error("Rules index source checksum is invalid");
  }
}

export function tokenize(value: string): string[] {
  return (value.normalize("NFKC").toLowerCase().match(TOKEN_PATTERN) ?? []).filter(
    (term) => term.length > 1 || /^\d+$/.test(term),
  );
}

function documentSearchText(document: RulesDocument): string {
  return [
    document.ruleNumber,
    document.glossaryTerm,
    document.section,
    document.text,
  ]
    .filter(Boolean)
    .join(" ");
}

function citationFor(
  index: RulesIndex,
  document: RulesDocument,
): RulesCitation {
  return {
    ...(document.ruleNumber ? { ruleNumber: document.ruleNumber } : {}),
    ...(document.glossaryTerm ? { glossaryTerm: document.glossaryTerm } : {}),
    section: document.section,
    page: document.page,
    sourceUrl: index.source.sourceUrl,
  };
}

function boundedExcerpt(text: string, terms: string[], maximum: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maximum) return normalized;
  const lower = normalized.toLowerCase();
  const firstMatch = terms
    .map((term) => lower.indexOf(term))
    .filter((position) => position >= 0)
    .sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, Math.min(firstMatch - 80, normalized.length - maximum));
  const excerpt = normalized.slice(start, start + maximum).trim();
  return `${start > 0 ? "…" : ""}${excerpt}${
    start + maximum < normalized.length ? "…" : ""
  }`;
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`Expected an integer from ${minimum} through ${maximum}`);
  }
  return value;
}
