import { splitRulesQuery } from "../rules/index.js";
import type { RulesKnowledgeBase } from "../rules/knowledge-base.js";
import type { RulesSearchHit } from "../rules/types.js";
import type { CardRules, GameState } from "./schemas.js";

// These retrieval pointers were checked against this pinned rules edition.
// They select candidate authority, never an outcome or a claim of applicability.
const VERIFIED_RULES_VERSION = "2026-08-07";
const MAX_QUERIES = 24;
const MAX_STATE_QUERIES = 8;
const MAX_RESULTS = 10;

export type MechanicHint = {
  mechanic: string;
  reason: string;
  ruleNumbers: string[];
  authority: "retrieval-hint";
  verifiedForRulesVersion: string;
};

export type InteractionRetrievalPlan = {
  queries: string[];
  mechanicHints: MechanicHint[];
};

function stateQueryGroups(state: GameState | undefined): string[][] {
  if (!state) return [];
  const orderedFields: Array<keyof GameState> = [
    "relevant_effects", "additional_context", "battlefield", "stack", "targets",
    "choices", "phase", "active_player", "priority_player",
  ];
  return orderedFields.flatMap((field) => {
    const value = state[field];
    const items = typeof value === "string" ? [value] : value ?? [];
    return items.length ? [items.flatMap((item) => splitRulesQuery(item))] : [];
  });
}

function roundRobin(groups: string[][], maximum: number, initial: string[] = []): string[] {
  const result = [...initial];
  const seen = new Set(result);
  const longest = Math.max(0, ...groups.map((group) => group.length));
  for (let position = 0; position < longest && result.length < maximum; position++) {
    for (const group of groups) {
      const query = group[position];
      if (query && !seen.has(query)) {
        seen.add(query);
        result.push(query);
        if (result.length === maximum) break;
      }
    }
  }
  return result;
}

/** The complete supplied state informs hints; only bounded chunks become lexical queries. */
export function planInteractionRetrieval(
  question: string,
  cards: CardRules[],
  state?: GameState,
): InteractionRetrievalPlan {
  const questionQueries = splitRulesQuery(question);
  const stateQueries = roundRobin(stateQueryGroups(state), MAX_STATE_QUERIES);
  const contextQueries = [...new Set([...questionQueries, ...stateQueries])].slice(0, MAX_QUERIES);
  const cardQueries = cards.map((card) => [
    // Separate keywords so a frequent keyword cannot hide a different mechanic.
    ...card.keywords.flatMap((keyword) => splitRulesQuery(keyword)),
    ...card.effects.flatMap(({ text }) => splitRulesQuery(text)),
    ...card.faces.flatMap((face) => splitRulesQuery(face.oracleText ?? "")),
  ]);
  const queries = roundRobin(cardQueries, MAX_QUERIES, contextQueries);
  const mechanicText = [
    question,
    ...Object.values(state ?? {}).flatMap((value) => typeof value === "string" ? [value] : value ?? []),
    ...cards.flatMap((card) => [card.oracleText ?? "", ...card.keywords, ...card.faces.map((face) => face.oracleText ?? "")]),
  ].join("\n").toLowerCase();
  return { queries, mechanicHints: mechanicHints(mechanicText) };
}

export function interactionQueries(question: string, cards: CardRules[], state?: GameState): string[] {
  return planInteractionRetrieval(question, cards, state).queries;
}

function mechanicHints(text: string): MechanicHint[] {
  const hints: MechanicHint[] = [];
  const add = (mechanic: string, reason: string, ruleNumbers: string[]) => hints.push({
    mechanic, reason, ruleNumbers, authority: "retrieval-hint", verifiedForRulesVersion: VERIFIED_RULES_VERSION,
  });
  const trample = /\btrample\b/.test(text);
  const deathtouch = /\bdeathtouch\b/.test(text);
  if (trample && deathtouch) {
    add("deathtouch-and-trample", "Both deathtouch and trample occur in the supplied evidence; inspect lethal assignment and excess damage rules.", ["702.2c", "702.19b"]);
  } else if (trample) {
    add("trample-assignment", "Trample occurs in the supplied evidence; inspect its combat damage assignment rule.", ["702.19b"]);
  }
  if (/\b(?:die|dies|died|dying|death|deaths)\b/.test(text)) {
    add("dies-definition", "The supplied evidence discusses dying; inspect the rules definition of dies.", ["700.4"]);
  }
  if (/\b(?:instead|replacement|replaced)\b/.test(text)) {
    add("replacement-events", "Replacement wording occurs in the supplied evidence; inspect whether the original event happens.", ["614.6"]);
  }
  const abilityRemoval = /\b(?:lose|loses|lost|remove|removes|removed|removing)\b[^.\n]{0,80}\babilit(?:y|ies)\b/.test(text) || /ability-removing/.test(text);
  const powerSetting = /\bbase (?:power|toughness)\b|\bpower and toughness\b|power\/toughness/.test(text);
  const typeChanging = /\b(?:becomes?|is|are) (?:a |an )?creature[^.\n]{0,100}\bin addition\b|\btype-changing\b/.test(text);
  const explicitLayers = /\b(?:layers?|sublayers?|timestamps?)\b/.test(text);
  if (explicitLayers || abilityRemoval || powerSetting || typeChanging) {
    const pointers = [
      ...(typeChanging ? ["613.1d"] : []),
      ...(abilityRemoval ? ["613.1f"] : []),
      ...(powerSetting ? ["613.4b"] : []),
      "613.6", "613.7",
    ];
    add("continuous-effect-layers", "The evidence discusses continuous changes or layers; inspect applicable layers, effects spanning layers, and timestamps. Dependency and other exceptions may still matter.", pointers);
  }
  return hints;
}

/** Reserve slots for verified mechanic pointers, then fill with ordinary lexical candidates. */
export async function retrieveInteractionRules(rules: RulesKnowledgeBase, plan: InteractionRetrievalPlan) {
  const lexical = await rules.searchMany({
    queries: plan.queries, limit: MAX_RESULTS, maxExcerptChars: 600, includeGlossary: false,
  });
  const requestedRules = [...new Set(plan.mechanicHints.flatMap((hint) => hint.ruleNumbers))].slice(0, MAX_RESULTS - 1);
  const versionMatches = lexical.source.version === VERIFIED_RULES_VERSION;
  const focused = versionMatches ? await Promise.all(requestedRules.map(async (ruleNumber) => {
    const result = await rules.search({ query: ruleNumber, limit: 1, maxExcerptChars: 600, includeGlossary: false });
    return result.results.find((hit) => hit.citation.ruleNumber === ruleNumber);
  })) : [];
  const results: RulesSearchHit[] = [];
  const seen = new Set<string>();
  for (const hit of [...focused, ...lexical.results]) {
    if (!hit) continue;
    const key = JSON.stringify(hit.citation);
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(hit);
    if (results.length === MAX_RESULTS) break;
  }
  const retainedRuleNumbers = new Set(focused.flatMap((hit) => hit?.citation.ruleNumber ? [hit.citation.ruleNumber] : []));
  return {
    results,
    source: lexical.source,
    mechanicHints: plan.mechanicHints.map((hint) => ({
      ...hint,
      status: !versionMatches ? "source_version_mismatch" : hint.ruleNumbers.every((number) => retainedRuleNumbers.has(number)) ? "retrieved" : "partial",
      retrievedRuleNumbers: hint.ruleNumbers.filter((number) => retainedRuleNumbers.has(number)),
    })),
  };
}
