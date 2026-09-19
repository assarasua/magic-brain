import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { searchRuleQueries, searchRules, splitRulesQuery, validateRulesIndex } from "./index.js";
import { OFFICIAL_RULES_SOURCE, RULES_ATTRIBUTION } from "./source.js";
import type { RulesIndex, RulesSearchHit } from "./types.js";

const DEFAULT_MAX_INDEX_BYTES = 24 * 1024 * 1024;
const DEFAULT_LOAD_TIMEOUT_MS = 5_000;

export interface RulesKnowledgeBaseOptions {
  indexPath?: string;
  index?: RulesIndex;
  maxIndexBytes?: number;
  loadTimeoutMs?: number;
}

export interface SearchRulesInput {
  query: string;
  limit?: number;
  maxExcerptChars?: number;
  includeGlossary?: boolean;
}

export type AskRulesInput = Omit<SearchRulesInput, "query"> & {
  question: string;
};

export class RulesKnowledgeBase {
  readonly #options: {
    indexPath?: string;
    index?: RulesIndex;
    maxIndexBytes: number;
    loadTimeoutMs: number;
  };
  #indexPromise: Promise<RulesIndex> | undefined;

  constructor(options: RulesKnowledgeBaseOptions) {
    if (!options.indexPath && !options.index) {
      throw new Error("A rules index path or in-memory index is required");
    }
    this.#options = {
      ...(options.indexPath ? { indexPath: resolve(options.indexPath) } : {}),
      ...(options.index ? { index: options.index } : {}),
      maxIndexBytes: options.maxIndexBytes ?? DEFAULT_MAX_INDEX_BYTES,
      loadTimeoutMs: options.loadTimeoutMs ?? DEFAULT_LOAD_TIMEOUT_MS,
    };
  }

  search(input: SearchRulesInput): Promise<ReturnType<typeof resultEnvelope>> {
    return this.#withIndex((index) =>
      resultEnvelope(
        index,
        searchRules(index, input.query, searchOptions(input)),
      ),
    );
  }

  searchMany(
    input: Omit<SearchRulesInput, "query"> & { queries: string[] },
  ): Promise<ReturnType<typeof resultEnvelope>> {
    return this.#withIndex((index) => resultEnvelope(
      index, searchRuleQueries(index, input.queries, searchOptions(input)),
    ));
  }

  ask(input: AskRulesInput): Promise<{
    question: string;
    officialRules: RulesSearchHit[];
    explanatorySynthesis: {
      authority: "non-authoritative";
      text: string;
    };
    source: ReturnType<typeof sourceEnvelope>;
  }> {
    return this.#withIndex((index) => {
      const officialRules = searchRuleQueries(
        index,
        splitRulesQuery(input.question),
        searchOptions(input),
      );
      const authorities = officialRules
        .map(({ citation }) =>
          citation.ruleNumber
            ? `rule ${citation.ruleNumber}`
            : `the glossary entry “${citation.glossaryTerm}”`,
        )
        .join(", ");
      return {
        question: input.question,
        officialRules,
        explanatorySynthesis: {
          authority: "non-authoritative",
          text:
            officialRules.length === 0
              ? "No matching official excerpt was found. Do not infer a rules answer from this result."
              : `The retrieved authority most relevant to this question is ${authorities}. This sentence is retrieval guidance, not an official ruling; use the quoted excerpts and citations as authority.`,
        },
        source: sourceEnvelope(index),
      };
    });
  }

  async #withIndex<T>(operation: (index: RulesIndex) => T): Promise<T> {
    const index = await this.#load();
    return operation(index);
  }

  #load(): Promise<RulesIndex> {
    if (this.#options.index) {
      validateRulesIndex(this.#options.index);
      return Promise.resolve(this.#options.index);
    }
    this.#indexPromise ??= withTimeout(
      loadIndex(this.#options.indexPath!, this.#options.maxIndexBytes),
      this.#options.loadTimeoutMs,
      "Timed out while loading the local Comprehensive Rules index",
    ).catch((error: unknown) => {
      this.#indexPromise = undefined;
      throw error;
    });
    return this.#indexPromise;
  }
}

function searchOptions(input: Omit<SearchRulesInput, "query">) {
  return {
    ...(input.limit !== undefined ? { limit: input.limit } : {}),
    ...(input.maxExcerptChars !== undefined
      ? { maxExcerptChars: input.maxExcerptChars }
      : {}),
    ...(input.includeGlossary === false
      ? { kinds: ["rule"] as Array<"rule"> }
      : {}),
  };
}

async function loadIndex(path: string, maximumBytes: number): Promise<RulesIndex> {
  let details;
  try {
    details = await stat(path);
  } catch {
    throw new Error(
      `Rules index not found at ${path}. Run the documented fetch/extract/index workflow.`,
    );
  }
  if (!details.isFile() || details.size > maximumBytes) {
    throw new Error(`Rules index must be a file no larger than ${maximumBytes} bytes`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch {
    throw new Error("Rules index is not valid JSON");
  }
  validateRulesIndex(parsed as RulesIndex);
  return parsed as RulesIndex;
}

function resultEnvelope(index: RulesIndex, results: RulesSearchHit[]) {
  return {
    results,
    source: sourceEnvelope(index),
  };
}

function sourceEnvelope(index: RulesIndex) {
  return {
    version: index.source.version,
    effectiveDate: index.source.effectiveDate,
    fetchedAt: index.source.fetchedAt,
    sourceUrl: index.source.sourceUrl,
    rulesPageUrl: index.source.rulesPageUrl,
    sha256: index.source.sha256,
    matchesPinnedOfficialSource:
      index.source.sourceUrl === OFFICIAL_RULES_SOURCE.sourceUrl &&
      index.source.sha256 === OFFICIAL_RULES_SOURCE.sha256 &&
      index.source.version === OFFICIAL_RULES_SOURCE.version,
    freshnessNotice:
      `This is a rules snapshot effective ${index.source.effectiveDate}, fetched ${index.source.fetchedAt}. It has not been checked against the current live rules during this request. The configured pinned source is ${OFFICIAL_RULES_SOURCE.version}; check the official rules page for subsequent changes.`,
    attribution: RULES_ATTRIBUTION,
  };
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
