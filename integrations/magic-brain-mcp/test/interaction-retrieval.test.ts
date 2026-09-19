import { describe, expect, it } from "vitest";
import { planInteractionRetrieval, retrieveInteractionRules } from "../src/cards/interaction-retrieval.js";
import type { CardRules } from "../src/cards/schemas.js";
import { buildRulesIndex } from "../src/rules/index.js";
import { RulesKnowledgeBase } from "../src/rules/knowledge-base.js";
import { OFFICIAL_RULES_SOURCE } from "../src/rules/source.js";
import type { RulesDocument } from "../src/rules/types.js";

// Small source-verified excerpts exercise retrieval; no ignored corpus is required.
const excerpts: Array<[string, string, number]> = [
  ["702.2c", "Any nonzero amount of combat damage assigned to a creature by a source with deathtouch is considered to be lethal damage for the purposes of determining if excess damage is being dealt.", 146],
  ["702.19b", "The controller of an attacking creature with trample first assigns damage to the creature(s) blocking it.", 151],
  ["700.4", "The term dies means “is put into a graveyard from the battlefield.”", 124],
  ["614.6", "If an event is replaced, it never happens. A modified event occurs instead, which may in turn trigger abilities.", 117],
  ["613.1d", "Layer 4: Type-changing effects are applied.", 112],
  ["613.1f", "Layer 6: Ability-adding effects, keyword counters, ability-removing effects, and effects that say an object can’t have an ability are applied.", 112],
  ["613.4b", "Layer 7b: Effects that set power and/or toughness to a specific number or value are applied.", 113],
  ["613.6", "If an effect should be applied in different layers and/or sublayers, the parts of the effect each apply in their appropriate ones.", 114],
  ["613.7", "Within a layer or sublayer, determining which order effects are applied in is usually done using a timestamp system.", 114],
];

function knowledge({ version = OFFICIAL_RULES_SOURCE.version as string, missing = [] as string[] } = {}) {
  const documents: RulesDocument[] = excerpts.filter(([number]) => !missing.includes(number)).map(([ruleNumber, text, page]) => ({
    id: `rule:${ruleNumber}`, kind: "rule", ruleNumber, section: "Test excerpts", page, text,
  }));
  for (let number = 0; number < 20; number++) {
    documents.push({
      id: `rule:800.${number}`, kind: "rule", ruleNumber: `800.${number}`, section: "Synthetic distractors", page: 1,
      text: "Synthetic fixture: vigilance haste combat damage defending player trample deathtouch creature power blocking attacking draw a card graveyard battlefield.",
    });
  }
  documents.push({
    id: "glossary:distractor", kind: "glossary", glossaryTerm: "Distractor", section: "Glossary", page: 1,
    text: "Trample deathtouch lethal assignment graveyard replacement timestamp layer.",
  });
  return new RulesKnowledgeBase({ index: buildRulesIndex({
    ...OFFICIAL_RULES_SOURCE, version, fetchedAt: "2026-09-19T12:00:00Z", extractor: "test-fixture",
  }, documents) });
}

function card(text: string, keywords: string[] = []): CardRules {
  return {
    oracleId: "00000000-0000-4000-8000-000000000001", scryfallId: "00000000-0000-4000-8000-000000000002",
    name: "Generic test card", layout: "normal", typeLine: "Creature", oracleText: text, manaCost: "",
    keywords, sourceUrl: "https://scryfall.com/card/test/1/test", rulings: [], rulingsTruncated: false,
    faces: [{ faceIndex: 0, name: "Generic test card", typeLine: "Creature", manaCost: "", oracleText: text,
      power: "4", toughness: "4", loyalty: null, defense: null }],
    effects: text.split("\n").map((paragraph, effectIndex) => ({ faceIndex: 0, effectIndex, text: paragraph })),
  };
}

describe("interaction mechanic evidence", () => {
  it("retains deathtouch lethal assignment and trample rules despite many matching distractors", async () => {
    const cards = [
      card("Vigilance, deathtouch, haste\nCombat damage that would be dealt by creatures you control can't be prevented.\nWhenever this creature deals combat damage to a player, draw a card.", ["Vigilance", "Deathtouch", "Haste"]),
      card("Creatures you control have trample.\nWhenever a creature enters, draw a card."),
    ];
    const plan = planInteractionRetrieval("How much damage can my 4/4 assign through a 5/5 blocker?", cards);
    const result = await retrieveInteractionRules(knowledge(), plan);
    expect(result.results.slice(0, 2).map(({ citation }) => citation.ruleNumber)).toEqual(["702.2c", "702.19b"]);
    expect(result.results.length).toBeLessThanOrEqual(10);
    expect(result.results.every(({ citation }) => !citation.glossaryTerm)).toBe(true);
    expect(new Set(result.results.map(({ citation }) => citation.ruleNumber)).size).toBe(result.results.length);
    expect(result.mechanicHints[0]).toMatchObject({ authority: "retrieval-hint", status: "retrieved", retrievedRuleNumbers: ["702.2c", "702.19b"] });
  });

  it("includes decisive details supplied only in game state in both hints and lexical retrieval", async () => {
    const plan = planInteractionRetrieval("How much damage gets through?", [card("Vigilance", ["Vigilance"])], {
      relevant_effects: ["The attacker has deathtouch and trample."], battlefield: ["A 5/5 blocks a 4/4 attacker."],
    });
    expect(plan.queries).toContain("The attacker has deathtouch and trample.");
    const result = await retrieveInteractionRules(knowledge(), plan);
    expect(result.results.slice(0, 2).map(({ citation }) => citation.ruleNumber)).toEqual(["702.2c", "702.19b"]);
  });

  it("retrieves death/replacement authority from wording without special-casing card names", async () => {
    const plan = planInteractionRetrieval("Does the triggered ability trigger?", [
      card("Whenever a creature dies, draw a card."),
      card("If a card or token would be put into a graveyard from anywhere, exile it instead."),
    ]);
    const result = await retrieveInteractionRules(knowledge(), plan);
    expect(result.results.slice(0, 2).map(({ citation }) => citation.ruleNumber)).toEqual(["700.4", "614.6"]);
  });

  it("retains layer, ability removal, power-setting and timestamp authority", async () => {
    const plan = planInteractionRetrieval("Does the order of entry matter?", [
      card("All creatures lose all abilities and have base power and toughness 1/1."),
      card("Each other non-Aura enchantment is a creature in addition to its other types and has base power and base toughness each equal to its mana value."),
    ]);
    const result = await retrieveInteractionRules(knowledge(), plan);
    expect(result.results.slice(0, 5).map(({ citation }) => citation.ruleNumber)).toEqual(["613.1d", "613.1f", "613.4b", "613.6", "613.7"]);
  });

  it("bounds queries while inspecting all supplied state for mechanic hints", () => {
    const plan = planInteractionRetrieval("Consider this question carefully. ".repeat(55), Array.from({ length: 5 }, () => card("Generic Oracle paragraph. ".repeat(100))), {
      relevant_effects: Array.from({ length: 18 }, () => "Other details. ".repeat(15)),
      additional_context: `${"More context. ".repeat(140)}Deathtouch and trample apply.`,
    });
    expect(plan.queries.length).toBeLessThanOrEqual(24);
    expect(plan.queries.every((query) => query.length >= 2 && query.length <= 300)).toBe(true);
    expect(plan.mechanicHints.some(({ mechanic }) => mechanic === "deathtouch-and-trample")).toBe(true);
  });

  it("reports missing hinted rules and stops reserving pointers for an unverified rules edition", async () => {
    const plan = planInteractionRetrieval("How do deathtouch and trample interact?", []);
    const missing = await retrieveInteractionRules(knowledge({ missing: ["702.2c"] }), plan);
    expect(missing.mechanicHints[0]).toMatchObject({ status: "partial", retrievedRuleNumbers: ["702.19b"] });
    const later = await retrieveInteractionRules(knowledge({ version: "2099-01-01" }), plan);
    expect(later.mechanicHints[0]).toMatchObject({ status: "source_version_mismatch", retrievedRuleNumbers: [] });
  });
});
