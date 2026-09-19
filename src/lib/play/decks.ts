import snapshot from "./starter-cards.json" with { type: "json" };
import type { CardDefinition, Effect } from "./engine";

const effects: Record<string, Effect> = {
  "Llanowar Elves": "elf",
  "Lightning Bolt": "bolt",
  Divination: "draw2",
  Counterspell: "counter",
  Unsummon: "bounce",
  "Giant Growth": "growth",
  "Relentless Rats": "rats",
  "Persistent Petitioners": "petitioners",
  "Hare Apparent": "hare",
  "Slime Against Humanity": "slime",
};
export const STARTER_CARDS: CardDefinition[] = snapshot.map((card) => ({
  ...card,
  effect:
    effects[card.name] ??
    (card.typeLine.includes("Land") ? "land" : "creature"),
}));
export const PRESETS = [
  {
    id: "rabbits",
    name: ["Rabbit colony", "Colonia de conejos"],
    commander: "Isamaru, Hound of Konda",
    list: "40 Plains\n59 Hare Apparent",
  },
  {
    id: "oozes",
    name: ["Growing oozes", "Cienos crecientes"],
    commander: "Jasmine Boreal",
    list: "32 Forest\n8 Plains\n59 Slime Against Humanity",
  },
  {
    id: "advisors",
    name: ["Council of advisors", "Consejo de consejeros"],
    commander: "Tobias Andrion",
    list: "32 Island\n8 Plains\n59 Persistent Petitioners",
  },
  {
    id: "rats",
    name: ["Relentless swarm", "Enjambre implacable"],
    commander: "Lady Orca",
    list: "32 Swamp\n8 Mountain\n59 Relentless Rats",
  },
] as const;
export type DeckRow = { quantity: number; name: string; commander: boolean };
export type DeckInput = {
  name: string;
  commander: string;
  list: string;
  computer: boolean;
};
export type DeckIssue = { code: string; card?: string };
export function parseDeckList(text: string): {
  rows: DeckRow[];
  errors: DeckIssue[];
} {
  if (text.length > 30000) return { rows: [], errors: [{ code: "tooLong" }] };
  const rows: DeckRow[] = [];
  const errors: DeckIssue[] = [];
  let commander = false;
  let skip = false;
  for (const line of text.split(/\r?\n/)) {
    let value = line.trim();
    if (!value || value.startsWith("#") || value.startsWith("//")) continue;
    if (/^(commander|commanders|comandante|comandantes):?$/i.test(value)) {
      commander = true;
      skip = false;
      continue;
    }
    if (/^(deck|mainboard|main deck|mazo):?$/i.test(value)) {
      commander = false;
      skip = false;
      continue;
    }
    if (/^(sideboard|maybeboard|considering):?$/i.test(value)) {
      skip = true;
      continue;
    }
    if (skip) continue;
    const tagged = /\*(CMDR|COMMANDER)\*/i.test(value);
    value = value.replace(/\s*\*(CMDR|COMMANDER|F)\*\s*/gi, " ").trim();
    const quantity = value.match(/^(\d+)\s*x?\s+(.+)$/i);
    const count = quantity ? Number(quantity[1]) : 1;
    const name = (quantity?.[2] ?? value)
      .replace(/^\[[^\]]+\]\s*/, "")
      .replace(/\s+\([a-z0-9]{2,8}\)(?:\s+[a-z0-9-]+)?\s*$/i, "")
      .trim();
    if (
      !Number.isInteger(count) ||
      count < 1 ||
      count > 100 ||
      name.length < 1 ||
      name.length > 200 ||
      rows.length >= 150
    ) {
      errors.push({ code: "line", card: value.slice(0, 120) });
      continue;
    }
    rows.push({ quantity: count, name, commander: commander || tagged });
  }
  return { rows, errors };
}
export function deckRows(input: DeckInput) {
  const parsed = parseDeckList(input.list);
  const command = parseDeckList(input.commander);
  const explicit = command.rows.map((row) => ({ ...row, commander: true }));
  const remaining = parsed.rows.map((row) => ({ ...row }));
  for (const commander of explicit) {
    let remove = commander.quantity;
    for (const row of remaining) {
      if (row.name.toLowerCase() !== commander.name.toLowerCase()) continue;
      const count = Math.min(remove, row.quantity);
      row.quantity -= count;
      remove -= count;
    }
  }
  return {
    rows: [...explicit, ...remaining.filter((row) => row.quantity > 0)],
    errors: [...parsed.errors, ...command.errors],
  };
}
export function manualCard(name: string): CardDefinition {
  return {
    id: `manual:${name.toLowerCase()}`,
    name,
    manaCost: "",
    typeLine: "Card · Manual",
    oracleText: "",
    keywords: [],
    colorIdentity: [],
    power: 0,
    toughness: 0,
    effect: "manual",
  };
}
export function findDefinition(name: string, extra: CardDefinition[] = []) {
  return (
    [...extra, ...STARTER_CARDS].find(
      (c) => c.name.toLowerCase() === name.toLowerCase(),
    ) ?? manualCard(name)
  );
}
export function buildDeck(input: DeckInput, extra: CardDefinition[] = []) {
  const { rows, errors } = deckRows(input);
  const issues: DeckIssue[] = [...errors];
  const warnings: DeckIssue[] = [];
  const cards: CardDefinition[] = [];
  const commanders: CardDefinition[] = [];
  for (const row of rows) {
    const def = findDefinition(row.name, extra);
    if (!def.sourceUrl || def.colorIdentity.includes("?"))
      warnings.push({ code: "unverified", card: row.name });
    for (let i = 0; i < row.quantity; i++)
      (row.commander ? commanders : cards).push(def);
  }
  if (commanders.length < 1 || commanders.length > 2)
    issues.push({ code: "commanderCount" });
  if (cards.length + commanders.length !== 100)
    issues.push({ code: "deckSize" });
  const identity = new Set(commanders.flatMap((c) => c.colorIdentity));
  for (const def of commanders)
    if (
      def.sourceUrl &&
      !(
        /Legendary.*Creature/.test(def.typeLine) ||
        /can be your commander/i.test(def.oracleText) ||
        /Background/.test(def.typeLine)
      )
    )
      issues.push({ code: "notCommander", card: def.name });
  if (commanders.length === 2) warnings.push({ code: "partner" });
  const groups = new Map<string, CardDefinition[]>();
  for (const def of [...cards, ...commanders])
    groups.set(def.name, [...(groups.get(def.name) ?? []), def]);
  for (const [name, defs] of groups) {
    const def = defs[0];
    if (
      defs.length > 1 &&
      !/\bBasic\b.*\bLand\b/.test(def.typeLine) &&
      !/deck can have any number of cards named/i.test(def.oracleText)
    ) {
      if (!def.sourceUrl || def.colorIdentity.includes("?"))
        warnings.push({ code: "singletonUnknown", card: name });
      else {
        const limit = def.oracleText.match(
          /deck can have up to (\w+) cards named/i,
        )?.[1];
        const allowed =
          ({ seven: 7, nine: 9 } as Record<string, number>)[limit ?? ""] ?? 1;
        if (defs.length > allowed)
          issues.push({ code: "singleton", card: name });
      }
    }
    if (
      commanders.every((c) => c.sourceUrl) &&
      !identity.has("?") &&
      def.colorIdentity.some((c) => c !== "?" && !identity.has(c))
    )
      issues.push({ code: "color", card: name });
  }
  const manual = [
    ...new Set(
      [...cards, ...commanders]
        .filter((c) => c.effect === "manual")
        .map((c) => c.name),
    ),
  ];
  return {
    deck: { name: input.name, computer: input.computer, cards, commanders },
    issues,
    warnings,
    manual,
    count: cards.length + commanders.length,
  };
}
export function definitionFromLookup(
  card: {
    oracleId: string;
    name: string;
    manaCost?: string;
    typeLine?: string;
    oracleText?: string;
    keywords?: string[];
    faces?: { power?: string; toughness?: string }[];
    sourceUrl?: string;
  },
  printing: { colorIdentity?: string[]; imageUrl?: string } = {},
): CardDefinition {
  const builtIn = STARTER_CARDS.find(
    (c) => c.id === card.oracleId && c.oracleText === (card.oracleText ?? ""),
  );
  return {
    id: card.oracleId,
    name: card.name,
    manaCost: card.manaCost ?? "",
    typeLine: card.typeLine ?? "Card",
    oracleText: card.oracleText ?? "",
    keywords: card.keywords ?? [],
    power: Number(card.faces?.[0]?.power) || 0,
    toughness: Number(card.faces?.[0]?.toughness) || 0,
    colorIdentity: printing.colorIdentity ?? builtIn?.colorIdentity ?? ["?"],
    imageUrl: printing.imageUrl,
    sourceUrl: card.sourceUrl,
    effect: builtIn?.effect ?? "manual",
  };
}
