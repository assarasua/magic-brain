export const STEPS = [
  "untap",
  "upkeep",
  "draw",
  "main1",
  "beginCombat",
  "attackers",
  "blockers",
  "firstStrike",
  "damage",
  "endCombat",
  "main2",
  "end",
  "cleanup",
] as const;
export type Step = (typeof STEPS)[number];
export type Zone =
  | "library"
  | "hand"
  | "battlefield"
  | "graveyard"
  | "exile"
  | "command"
  | "stack";
export type Color = "W" | "U" | "B" | "R" | "G" | "C";
export const COLORS: Color[] = ["W", "U", "B", "R", "G", "C"];
export type Effect =
  | "land"
  | "creature"
  | "elf"
  | "bolt"
  | "draw2"
  | "counter"
  | "bounce"
  | "growth"
  | "rats"
  | "petitioners"
  | "hare"
  | "slime"
  | "manual";
export type CardDefinition = {
  id: string;
  name: string;
  manaCost: string;
  typeLine: string;
  oracleText: string;
  keywords: string[];
  power: number;
  toughness: number;
  colorIdentity: string[];
  effect: Effect;
  imageUrl?: string;
  sourceUrl?: string;
  sourceUpdatedAt?: string;
};
export type Card = {
  id: string;
  def: string;
  owner: number;
  controller: number;
  zone: Zone;
  tapped: boolean;
  entered: number;
  damage: number;
  deadly: boolean;
  counters: number;
  buff: number;
  token: boolean;
  commander: boolean;
  casts: number;
  incarnation: number;
};
export type Player = {
  name: string;
  computer: boolean;
  life: number;
  poison: number;
  mana: Record<Color, number>;
  kept: boolean;
  mulligans: number;
  lands: number;
  lost: boolean;
  failedDraw: boolean;
  commanderDamage: Record<string, number>;
};
export type Target =
  | { player: number }
  | { card: string; incarnation?: number }
  | { spell: string };
export type StackItem = {
  id: string;
  card: string;
  controller: number;
  effect: Effect | "hareTrigger" | "mill1" | "mill12";
  target?: Target;
  ability: boolean;
  sourceIncarnation?: number;
};
export type Attack = {
  card: string;
  defender: number;
  blockers: string[];
  blocked: boolean;
};
export type Game = {
  version: 1;
  seed: number;
  nextId: number;
  turn: number;
  active: number;
  priority: number;
  step: Step;
  passes: number;
  opening: boolean;
  declaration: boolean;
  damagePending: boolean;
  cleanupPriority: boolean;
  winner: number | "draw" | null;
  players: Player[];
  definitions: Record<string, CardDefinition>;
  cards: Card[];
  stack: StackItem[];
  attacks: Attack[];
  firstStrikers: string[];
  commanderChoices: { card: string; zone: Zone }[];
  manualResolution: boolean;
  log: { en: string; es: string }[];
};
export type Deck = {
  name: string;
  computer: boolean;
  cards: CardDefinition[];
  commanders: CardDefinition[];
};
export type Action =
  | { type: "pass"; player: number }
  | { type: "mulligan"; player: number }
  | { type: "keep"; player: number; bottom: string[] }
  | { type: "land"; player: number; card: string }
  | { type: "tapMana"; player: number; card: string; color?: Color }
  | {
      type: "cast";
      player: number;
      card: string;
      target?: Target;
      autoPay: boolean;
      manual?: boolean;
    }
  | {
      type: "activate";
      player: number;
      card: string;
      target: number;
      group?: string[];
    }
  | {
      type: "attack";
      player: number;
      attacks: { card: string; defender: number }[];
    }
  | {
      type: "block";
      player: number;
      blocks: { card: string; attacker: string }[];
      finish?: boolean;
    }
  | { type: "damage"; player: number }
  | { type: "discard"; player: number; cards: string[] }
  | { type: "commander"; player: number; card: string; command: boolean }
  | { type: "resolveManual"; player: number; note: string }
  | {
      type: "manual";
      player: number;
      note: string;
      card?: string;
      zone?: Zone;
      tap?: boolean;
      damage?: number;
      counters?: number;
      life?: number;
      poison?: number;
      mana?: Color;
      step?: Step;
      draw?: boolean;
      shuffle?: boolean;
      controller?: number;
      stackAbility?: boolean;
      token?: {
        name: string;
        power: number;
        toughness: number;
        keywords: string[];
      };
      commanderDamage?: { source: string; amount: number };
    }
  | { type: "concede"; player: number };
export class GameRuleError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}
function requireRule(condition: unknown, code: string): asserts condition {
  if (!condition) throw new GameRuleError(code);
}
const emptyMana = (): Record<Color, number> => ({
  W: 0,
  U: 0,
  B: 0,
  R: 0,
  G: 0,
  C: 0,
});
export const definition = (s: Game, c: Card) => s.definitions[c.def];
export const inZone = (s: Game, player: number, zone: Zone) =>
  s.cards.filter(
    (c) =>
      c.zone === zone &&
      (zone === "battlefield" ? c.controller : c.owner) === player,
  );
export const creature = (s: Game, c: Card) =>
  definition(s, c).typeLine.includes("Creature");
export const has = (s: Game, c: Card, keyword: string) =>
  definition(s, c).keywords.some(
    (k) => k.toLowerCase() === keyword.toLowerCase(),
  );
export const living = (s: Game) =>
  s.players.map((p, i) => (p.lost ? -1 : i)).filter((i) => i >= 0);
export function nextPlayer(s: Game, after: number) {
  for (let n = 1; n <= s.players.length; n++) {
    const i = (after + n) % s.players.length;
    if (!s.players[i].lost) return i;
  }
  return after;
}
function log(s: Game, en: string, es: string) {
  s.log.push({ en, es });
  if (s.log.length > 160) s.log.shift();
}
function instance(s: Game, id: string) {
  const c = s.cards.find((c) => c.id === id);
  requireRule(c, "missing");
  return c;
}
function random(s: Game) {
  s.seed = (Math.imul(1664525, s.seed) + 1013904223) >>> 0;
  return s.seed / 4294967296;
}
function shuffle(s: Game, owner: number) {
  const cards = inZone(s, owner, "library");
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(random(s) * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  s.cards = s.cards
    .filter((c) => !(c.owner === owner && c.zone === "library"))
    .concat(cards);
}
function newCard(
  s: Game,
  def: CardDefinition,
  owner: number,
  zone: Zone,
  commander = false,
  token = false,
): Card {
  s.definitions[def.id] = def;
  const c: Card = {
    id: `c${s.nextId++}`,
    def: def.id,
    owner,
    controller: owner,
    zone,
    tapped: false,
    entered: s.turn,
    damage: 0,
    deadly: false,
    counters: 0,
    buff: 0,
    token,
    commander,
    casts: 0,
    incarnation: 0,
  };
  s.cards.push(c);
  return c;
}
function move(s: Game, c: Card, zone: Zone, offer = true) {
  const old = c.zone;
  if (old !== zone) c.incarnation++;
  if (old === "battlefield") {
    s.attacks = s.attacks.filter((a) => a.card !== c.id);
    for (const a of s.attacks)
      a.blockers = a.blockers.filter((id) => id !== c.id);
  }
  c.zone = zone;
  c.tapped = false;
  c.damage = 0;
  c.deadly = false;
  c.counters = 0;
  c.buff = 0;
  c.controller = c.owner;
  c.entered = s.turn;
  if (zone === "library") {
    s.cards = s.cards.filter((x) => x.id !== c.id).concat(c);
  }
  if (
    c.commander &&
    offer &&
    old !== zone &&
    ["graveyard", "exile", "hand", "library"].includes(zone) &&
    !s.players[c.owner].lost
  )
    s.commanderChoices.push({ card: c.id, zone });
  if (c.token && zone !== "battlefield")
    s.cards = s.cards.filter((x) => x.id !== c.id);
}
function draw(s: Game, player: number, count: number) {
  for (let n = 0; n < count; n++) {
    const c = inZone(s, player, "library")[0];
    if (!c) {
      s.players[player].failedDraw = true;
      break;
    }
    move(s, c, "hand", false);
  }
  log(
    s,
    `${s.players[player].name} draws ${count}.`,
    `${s.players[player].name} roba ${count}.`,
  );
}
function mill(s: Game, player: number, count: number) {
  for (const c of inZone(s, player, "library").slice(0, count))
    move(s, c, "graveyard");
  log(
    s,
    `${s.players[player].name} mills ${count}.`,
    `${s.players[player].name} muele ${count}.`,
  );
}
export function stats(s: Game, c: Card) {
  const d = definition(s, c);
  const rats =
    d.effect === "rats"
      ? s.cards.filter(
          (x) =>
            x.zone === "battlefield" &&
            x.id !== c.id &&
            definition(s, x).name === "Relentless Rats",
        ).length
      : 0;
  return {
    power: d.power + c.counters + c.buff + rats,
    toughness: d.toughness + c.counters + c.buff + rats,
  };
}
export function summoningSick(s: Game, c: Card) {
  return creature(s, c) && c.entered >= s.turn && !has(s, c, "Haste");
}
export function canAttack(s: Game, c: Card) {
  return (
    c.zone === "battlefield" &&
    c.controller === s.active &&
    creature(s, c) &&
    !c.tapped &&
    !summoningSick(s, c) &&
    !has(s, c, "Defender")
  );
}
export function canBlock(s: Game, blocker: Card, attacker: Card) {
  return (
    blocker.zone === "battlefield" &&
    creature(s, blocker) &&
    !blocker.tapped &&
    (!has(s, attacker, "Flying") ||
      has(s, blocker, "Flying") ||
      has(s, blocker, "Reach"))
  );
}
function eliminate(s: Game, player: number) {
  const p = s.players[player];
  if (p.lost) return;
  p.lost = true;
  s.passes = 0;
  s.stack = s.stack.filter(
    (x) =>
      x.controller !== player &&
      s.cards.find((c) => c.id === x.card)?.owner !== player,
  );
  s.cards = s.cards.filter((c) => c.owner !== player);
  for (const c of s.cards.filter((c) => c.controller === player))
    move(s, c, "exile");
  s.commanderChoices = s.commanderChoices.filter((x) =>
    s.cards.some((c) => c.id === x.card),
  );
  s.attacks = s.attacks.filter(
    (a) => a.defender !== player && s.cards.some((c) => c.id === a.card),
  );
  log(s, `${p.name} leaves the game.`, `${p.name} sale de la partida.`);
}
function stateBased(s: Game) {
  let changed = false;
  for (const [i, p] of s.players.entries())
    if (
      !p.lost &&
      (p.life <= 0 ||
        p.poison >= 10 ||
        p.failedDraw ||
        Object.values(p.commanderDamage).some((v) => v >= 21))
    ) {
      eliminate(s, i);
      changed = true;
    }
  let dying: Card[];
  do {
    dying = s.cards.filter(
      (c) =>
        c.zone === "battlefield" &&
        creature(s, c) &&
        definition(s, c).effect !== "manual" &&
        (stats(s, c).toughness <= 0 ||
          (!has(s, c, "Indestructible") &&
            (c.deadly || c.damage >= stats(s, c).toughness))),
    );
    for (const c of dying) {
      log(
        s,
        `${definition(s, c).name} goes to the graveyard.`,
        `${definition(s, c).name} va al cementerio.`,
      );
      move(s, c, "graveyard");
      changed = true;
    }
  } while (dying.length);
  const alive = living(s);
  if (alive.length <= 1) s.winner = alive[0] ?? "draw";
  if (s.players[s.priority]?.lost) s.priority = nextPlayer(s, s.priority);
  return changed;
}
function hit(
  s: Game,
  source: Card,
  target: Target,
  amount: number,
  combat = false,
) {
  amount = Math.max(0, amount);
  if (!amount) return;
  if ("player" in target) {
    const p = s.players[target.player];
    if (!p || p.lost) return;
    p.life -= amount;
    if (combat && source.commander)
      p.commanderDamage[source.id] =
        (p.commanderDamage[source.id] ?? 0) + amount;
  } else if ("card" in target) {
    const c = s.cards.find(
      (x) => x.id === target.card && x.zone === "battlefield",
    );
    if (!c) return;
    c.damage += amount;
    if (has(s, source, "Deathtouch")) c.deadly = true;
  }
  if (has(s, source, "Lifelink")) s.players[source.controller].life += amount;
}
export function bottomCount(s: Game, player: number) {
  return Math.max(
    0,
    s.players[player].mulligans - (s.players.length > 2 ? 1 : 0),
  );
}
export function createGame(decks: Deck[], seed = 1): Game {
  requireRule(decks.length >= 2 && decks.length <= 4, "players");
  const s: Game = {
    version: 1,
    seed: seed >>> 0,
    nextId: 1,
    turn: 1,
    active: 0,
    priority: 0,
    step: "untap",
    passes: 0,
    opening: true,
    declaration: false,
    damagePending: false,
    cleanupPriority: false,
    winner: null,
    players: decks.map((d) => ({
      name: d.name.slice(0, 60),
      computer: d.computer,
      life: 40,
      poison: 0,
      mana: emptyMana(),
      kept: false,
      mulligans: 0,
      lands: 0,
      lost: false,
      failedDraw: false,
      commanderDamage: {},
    })),
    definitions: {},
    cards: [],
    stack: [],
    attacks: [],
    firstStrikers: [],
    commanderChoices: [],
    manualResolution: false,
    log: [],
  };
  for (const [i, d] of decks.entries()) {
    requireRule(
      d.cards.length + d.commanders.length === 100 &&
        d.commanders.length >= 1 &&
        d.commanders.length <= 2,
      "deckSize",
    );
    for (const def of d.commanders) newCard(s, def, i, "command", true);
    for (const def of d.cards) newCard(s, def, i, "library");
    shuffle(s, i);
    draw(s, i, 7);
  }
  log(
    s,
    "Commander: choose opening hands. 40 life; 21 combat damage from one commander eliminates a player.",
    "Commander: elegid manos iniciales. 40 vidas; 21 daños de combate de un mismo comandante eliminan a un jugador.",
  );
  return s;
}
export function manaColor(s: Game, c: Card): Color | null {
  const d = definition(s, c);
  if (d.effect === "elf") return "G";
  if (d.effect !== "land") return null;
  const match = [
    ["Plains", "W"],
    ["Island", "U"],
    ["Swamp", "B"],
    ["Mountain", "R"],
    ["Forest", "G"],
    ["Wastes", "C"],
  ].find(([name]) => d.name === name || d.typeLine.includes(name));
  return (match?.[1] as Color) ?? null;
}
export function parseCost(cost: string, tax = 0) {
  const parts = [...cost.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
  if (
    cost.replace(/\{[^}]+\}/g, "").trim() ||
    parts.some((p) => !/^(\d+|[WUBRGC])$/.test(p))
  )
    return null;
  const required = emptyMana();
  let generic = tax;
  for (const part of parts)
    if (/^\d+$/.test(part)) generic += Number(part);
    else required[part as Color]++;
  return { required, generic };
}
export function payment(s: Game, player: number, c: Card, auto = true) {
  if (!definition(s, c).manaCost) return null;
  const cost = parseCost(
    definition(s, c).manaCost,
    c.commander && c.zone === "command" ? c.casts * 2 : 0,
  );
  if (!cost) return null;
  const mana = { ...s.players[player].mana };
  const sources = auto
    ? inZone(s, player, "battlefield").filter(
        (x) => !x.tapped && !summoningSick(s, x) && manaColor(s, x),
      )
    : [];
  const used: string[] = [];
  const add = (color?: Color) => {
    const source = sources.find(
      (x) => !used.includes(x.id) && (!color || manaColor(s, x) === color),
    );
    if (!source) return false;
    used.push(source.id);
    mana[manaColor(s, source)!]++;
    return true;
  };
  for (const color of COLORS) {
    while (mana[color] < cost.required[color]) if (!add(color)) return null;
    mana[color] -= cost.required[color];
  }
  while (COLORS.reduce((a, color) => a + mana[color], 0) < cost.generic)
    if (!add()) return null;
  let generic = cost.generic;
  for (const color of COLORS) {
    const spent = Math.min(generic, mana[color]);
    mana[color] -= spent;
    generic -= spent;
  }
  return { mana, used };
}
function validTarget(s: Game, effect: StackItem["effect"], target?: Target) {
  if (
    ["bolt", "growth", "bounce", "counter", "mill1", "mill12"].includes(
      effect,
    ) &&
    !target
  )
    return false;
  if (effect === "counter")
    return (
      target &&
      "spell" in target &&
      s.stack.some((x) => x.id === target.spell && !x.ability)
    );
  if (effect === "mill1" || effect === "mill12")
    return (
      target &&
      "player" in target &&
      !!s.players[target.player] &&
      !s.players[target.player].lost
    );
  if (["bolt", "growth", "bounce"].includes(effect)) {
    if (target && "player" in target)
      return (
        effect === "bolt" &&
        !!s.players[target.player] &&
        !s.players[target.player].lost
      );
    if (target && "card" in target)
      return s.cards.some(
        (c) =>
          c.id === target.card &&
          c.zone === "battlefield" &&
          creature(s, c) &&
          (target.incarnation === undefined ||
            c.incarnation === target.incarnation),
      );
    return false;
  }
  return !target;
}
function enter(s: Game, c: Card) {
  move(s, c, "battlefield", false);
  if (definition(s, c).effect === "hare")
    s.stack.push({
      id: `s${s.nextId++}`,
      card: c.id,
      controller: c.controller,
      effect: "hareTrigger",
      ability: true,
      sourceIncarnation: c.incarnation,
    });
}
function token(
  s: Game,
  player: number,
  name: string,
  power: number,
  toughness: number,
  keywords: string[],
  counters = 0,
) {
  const def: CardDefinition = {
    id: `token-${name}`,
    name,
    manaCost: "",
    typeLine: `Token Creature — ${name}`,
    oracleText: keywords.join(", "),
    keywords,
    power,
    toughness,
    colorIdentity: [name === "Rabbit" ? "W" : "G"],
    effect: "creature",
  };
  const c = newCard(s, def, player, "battlefield", false, true);
  c.counters = counters;
}
function resolve(s: Game) {
  const top = s.stack.at(-1)!;
  const c = s.cards.find((c) => c.id === top.card);
  if (!c && !top.ability) {
    s.stack.pop();
    return;
  }
  if (top.effect === "manual") {
    s.manualResolution = true;
    return;
  }
  s.stack.pop();
  if (!validTarget(s, top.effect, top.target)) {
    if (c && !top.ability) move(s, c, "graveyard");
    log(
      s,
      "The spell or ability has no legal target and does not resolve.",
      "El hechizo o habilidad no tiene objetivo legal y no se resuelve.",
    );
    return;
  }
  if (top.effect === "bolt" && c) hit(s, c, top.target!, 3);
  if (top.effect === "growth" && top.target && "card" in top.target)
    instance(s, top.target.card).buff += 3;
  if (top.effect === "bounce" && top.target && "card" in top.target)
    move(s, instance(s, top.target.card), "hand");
  if (top.effect === "counter" && top.target && "spell" in top.target) {
    const target = top.target.spell;
    const other = s.stack.find((x) => x.id === target)!;
    s.stack = s.stack.filter((x) => x.id !== target);
    move(s, instance(s, other.card), "graveyard");
  }
  if (top.effect === "draw2") draw(s, top.controller, 2);
  if (
    (top.effect === "mill1" || top.effect === "mill12") &&
    top.target &&
    "player" in top.target
  )
    mill(s, top.target.player, top.effect === "mill1" ? 1 : 12);
  if (top.effect === "hareTrigger") {
    const count = inZone(s, top.controller, "battlefield").filter(
      (x) =>
        (x.id !== top.card || x.incarnation !== top.sourceIncarnation) &&
        definition(s, x).name === "Hare Apparent",
    ).length;
    requireRule(s.cards.length + count <= 900, "tableLimit");
    for (let i = 0; i < count; i++)
      token(s, top.controller, "Rabbit", 1, 1, []);
  }
  if (top.effect === "slime") {
    const count = s.cards.filter(
      (x) =>
        x.owner === top.controller &&
        ["graveyard", "exile"].includes(x.zone) &&
        (definition(s, x).typeLine.includes("Ooze") ||
          definition(s, x).name === "Slime Against Humanity"),
    ).length;
    token(s, top.controller, "Ooze", 0, 0, ["Trample"], count + 2);
  }
  if (c && !top.ability) {
    if (creature(s, c)) enter(s, c);
    else move(s, c, "graveyard");
  }
  log(
    s,
    `${c ? definition(s, c).name : "Ability"} resolves.`,
    `Se resuelve ${c ? definition(s, c).name : "la habilidad"}.`,
  );
}
function combatDamage(s: Game) {
  const first = s.step === "firstStrike";
  const participants = s.cards.filter(
    (c) =>
      c.zone === "battlefield" &&
      s.attacks.some((a) => a.card === c.id || a.blockers.includes(c.id)),
  );
  if (first)
    s.firstStrikers = participants
      .filter((c) => has(s, c, "First strike") || has(s, c, "Double strike"))
      .map((c) => c.id);
  const eligible = (c: Card) =>
    first
      ? s.firstStrikers.includes(c.id)
      : !s.firstStrikers.includes(c.id) || has(s, c, "Double strike");
  for (const attack of s.attacks) {
    const attacker = s.cards.find(
      (c) => c.id === attack.card && c.zone === "battlefield",
    );
    if (!attacker) continue;
    const blockers = attack.blockers
      .map((id) => s.cards.find((c) => c.id === id && c.zone === "battlefield"))
      .filter((c): c is Card => !!c);
    if (eligible(attacker)) {
      let power = Math.max(0, stats(s, attacker).power);
      for (const [i, blocker] of blockers.entries()) {
        const lethal = has(s, attacker, "Deathtouch")
          ? 1
          : Math.max(0, stats(s, blocker).toughness - blocker.damage);
        const amount =
          i === blockers.length - 1 && !has(s, attacker, "Trample")
            ? power
            : Math.min(power, lethal);
        hit(s, attacker, { card: blocker.id }, amount, true);
        power -= amount;
      }
      if (!attack.blocked || has(s, attacker, "Trample"))
        hit(s, attacker, { player: attack.defender }, power, true);
    }
    for (const blocker of blockers)
      if (eligible(blocker))
        hit(s, blocker, { card: attacker.id }, stats(s, blocker).power, true);
  }
  s.damagePending = false;
  log(
    s,
    first
      ? "First-strike combat damage is dealt simultaneously."
      : "Combat damage is dealt simultaneously.",
    first
      ? "Se hace simultáneamente el daño de dañar primero."
      : "Se hace simultáneamente el daño de combate.",
  );
}
function advance(s: Game) {
  for (const p of s.players) p.mana = emptyMana();
  s.passes = 0;
  s.cleanupPriority = false;
  s.declaration = false;
  s.damagePending = false;
  if (s.step === "cleanup" || s.players[s.active].lost) {
    s.active = nextPlayer(s, s.active);
    s.turn++;
    s.step = "untap";
    s.players[s.active].lands = 0;
    s.attacks = [];
    s.firstStrikers = [];
  } else {
    const next = STEPS.indexOf(s.step) + 1;
    s.step = STEPS[next];
    if (
      s.step === "firstStrike" &&
      !s.cards.some(
        (c) =>
          c.zone === "battlefield" &&
          s.attacks.some((a) => a.card === c.id || a.blockers.includes(c.id)) &&
          (has(s, c, "First strike") || has(s, c, "Double strike")),
      )
    )
      s.step = "damage";
  }
  s.priority = s.active;
  if (s.step === "draw" && !(s.turn === 1 && s.players.length === 2))
    draw(s, s.active, 1);
  if (s.step === "attackers") s.declaration = true;
  if (s.step === "blockers" && s.attacks.length) {
    s.declaration = true;
    s.priority = nextDefender(s, s.active);
  }
  if (s.step === "firstStrike" || s.step === "damage") s.damagePending = true;
  if (s.step === "endCombat") {
    s.attacks = [];
    s.firstStrikers = [];
  }
}
function nextDefender(s: Game, after: number) {
  let next = nextPlayer(s, after);
  for (let i = 0; i < s.players.length; i++) {
    if (s.attacks.some((a) => a.defender === next)) return next;
    next = nextPlayer(s, next);
  }
  return s.active;
}
function cleanup(s: Game) {
  requireRule(inZone(s, s.active, "hand").length <= 7, "discard");
  for (const c of s.cards) {
    c.damage = 0;
    c.deadly = false;
    c.buff = 0;
  }
  if (stateBased(s)) {
    s.cleanupPriority = true;
    s.passes = 0;
    s.priority = s.active;
  } else advance(s);
}
export function needsManual(s: Game) {
  return s.cards.some((c) => definition(s, c).effect === "manual");
}
export function actingPlayer(s: Game) {
  if (s.commanderChoices.length)
    return instance(s, s.commanderChoices[0].card).owner;
  return s.priority;
}
export function applyAction(previous: Game, action: Action): Game {
  const s = structuredClone(previous);
  requireRule(s.winner === null || action.type === "manual", "over");
  const p = s.players[action.player];
  requireRule(p && !p.lost, "player");
  if (action.type === "concede") {
    eliminate(s, action.player);
    stateBased(s);
    if (s.opening) {
      if (s.players[s.active].lost) s.active = nextPlayer(s, s.active);
      if (s.players.every((p) => p.kept || p.lost)) {
        s.opening = false;
        s.priority = s.active;
      }
    } else if (s.winner === null && s.players[s.active].lost) advance(s);
    return s;
  }
  if (action.type === "commander") {
    const choice = s.commanderChoices[0];
    requireRule(
      choice?.card === action.card &&
        instance(s, choice.card).owner === action.player,
      "commander",
    );
    if (action.command) move(s, instance(s, choice.card), "command", false);
    s.commanderChoices.shift();
    log(
      s,
      `${p.name} chooses ${action.command ? "the command zone" : choice.zone}.`,
      `${p.name} elige ${action.command ? "la zona de mando" : choice.zone}.`,
    );
    return s;
  }
  requireRule(!s.commanderChoices.length, "commander");
  if (action.type === "manual") {
    requireRule(
      action.note.trim().length >= 3 && action.note.length <= 500,
      "note",
    );
    for (const value of [
      action.life,
      action.poison,
      action.damage,
      action.counters,
      action.commanderDamage?.amount,
    ])
      if (value !== undefined)
        requireRule(
          Number.isInteger(value) && value >= -1000 && value <= 1000,
          "invalid",
        );
    if (action.card) {
      const c = instance(s, action.card);
      if (action.zone) {
        requireRule(
          [
            "library",
            "hand",
            "battlefield",
            "graveyard",
            "exile",
            "command",
            "stack",
          ].includes(action.zone),
          "invalid",
        );
        requireRule(c.zone !== "stack", "stack");
        move(s, c, action.zone);
      }
      if (action.controller !== undefined) {
        requireRule(
          c.zone === "battlefield" &&
            !!s.players[action.controller] &&
            !s.players[action.controller].lost,
          "invalid",
        );
        c.controller = action.controller;
        c.entered = s.turn;
      }
      if (action.stackAbility !== undefined || action.zone === "stack") {
        s.stack.push({
          id: `s${s.nextId++}`,
          card: c.id,
          controller: action.player,
          effect: "manual",
          ability: action.stackAbility ?? false,
        });
        s.passes = 0;
      }
      if (action.tap !== undefined) c.tapped = action.tap;
      if (action.damage !== undefined) c.damage = Math.max(0, action.damage);
      if (action.counters !== undefined) c.counters = action.counters;
    }
    if (action.draw) draw(s, action.player, 1);
    if (action.shuffle) shuffle(s, action.player);
    if (action.token) {
      const t = action.token;
      requireRule(
        t.name.trim().length > 0 &&
          t.name.length <= 80 &&
          Number.isInteger(t.power) &&
          Number.isInteger(t.toughness) &&
          Math.abs(t.power) <= 1000 &&
          Math.abs(t.toughness) <= 1000 &&
          t.keywords.every((k) => typeof k === "string" && k.length < 80) &&
          s.cards.length < 900,
        "invalid",
      );
      token(
        s,
        action.player,
        `Manual ${s.nextId}: ${t.name}`,
        t.power,
        t.toughness,
        t.keywords,
      );
      s.definitions[s.cards.at(-1)!.def].effect = "manual";
    }
    if (action.life !== undefined) p.life = action.life;
    if (action.poison !== undefined) p.poison = Math.max(0, action.poison);
    if (action.mana) {
      requireRule(COLORS.includes(action.mana), "invalid");
      p.mana[action.mana]++;
    }
    if (action.commanderDamage) {
      const source = instance(s, action.commanderDamage.source);
      requireRule(source.commander, "commander");
      p.commanderDamage[source.id] = Math.max(0, action.commanderDamage.amount);
    }
    if (action.step) {
      requireRule(STEPS.includes(action.step) && !s.stack.length, "stack");
      s.step = action.step;
      s.passes = 0;
      s.priority = s.active;
      s.declaration = ["attackers", "blockers"].includes(action.step);
      s.damagePending = ["firstStrike", "damage"].includes(action.step);
    }
    log(s, `Manual ruling: ${action.note}`, `Decisión manual: ${action.note}`);
    stateBased(s);
    if (!s.opening && s.winner === null && s.players[s.active].lost) advance(s);
    return s;
  }
  requireRule(action.player === s.priority, "priority");
  if (s.opening) {
    requireRule(
      action.type === "mulligan" || action.type === "keep",
      "opening",
    );
    if (action.type === "mulligan") {
      requireRule(bottomCount(s, action.player) < 7, "mulligan");
      for (const c of inZone(s, action.player, "hand"))
        move(s, c, "library", false);
      shuffle(s, action.player);
      p.mulligans++;
      draw(s, action.player, 7);
    } else {
      requireRule(
        action.bottom.length === bottomCount(s, action.player) &&
          new Set(action.bottom).size === action.bottom.length &&
          action.bottom.every((id) =>
            inZone(s, action.player, "hand").some((c) => c.id === id),
          ),
        "bottom",
      );
      for (const id of action.bottom)
        move(s, instance(s, id), "library", false);
      p.kept = true;
      s.priority = nextPlayer(s, s.priority);
      if (s.players.every((p) => p.kept || p.lost)) {
        s.opening = false;
        s.priority = s.active;
      }
    }
    return s;
  }
  if (s.manualResolution) {
    requireRule(
      action.type === "resolveManual" && action.note.trim().length >= 3,
      "manual",
    );
    const top = s.stack.pop()!;
    const c = s.cards.find((c) => c.id === top.card);
    if (!top.ability && c)
      move(
        s,
        c,
        /Instant|Sorcery/.test(definition(s, c).typeLine)
          ? "graveyard"
          : "battlefield",
      );
    s.manualResolution = false;
    s.priority = s.active;
    log(
      s,
      `Manual resolution: ${action.note}`,
      `Resolución manual: ${action.note}`,
    );
    stateBased(s);
    return s;
  }
  requireRule(
    !s.declaration || action.type === "attack" || action.type === "block",
    "declaration",
  );
  requireRule(!s.damagePending || action.type === "damage", "damage");
  requireRule(s.step !== "untap" || action.type === "pass", "noPriority");
  requireRule(
    s.step !== "cleanup" ||
      s.cleanupPriority ||
      action.type === "pass" ||
      action.type === "discard",
    "noPriority",
  );
  if (action.type === "pass") {
    if (s.step === "untap") {
      for (const c of inZone(s, s.active, "battlefield")) c.tapped = false;
      advance(s);
    } else if (s.step === "cleanup" && !s.cleanupPriority) cleanup(s);
    else {
      s.passes++;
      if (s.passes >= living(s).length) {
        s.passes = 0;
        if (s.stack.length) {
          resolve(s);
          s.priority = s.active;
        } else if (s.step === "cleanup") cleanup(s);
        else advance(s);
      } else s.priority = nextPlayer(s, s.priority);
    }
  } else if (action.type === "land") {
    const c = instance(s, action.card);
    requireRule(
      action.player === s.active &&
        ["main1", "main2"].includes(s.step) &&
        !s.stack.length &&
        p.lands === 0 &&
        c.owner === action.player &&
        c.zone === "hand" &&
        definition(s, c).effect === "land",
      "land",
    );
    p.lands++;
    enter(s, c);
    s.passes = 0;
    log(
      s,
      `${p.name} plays ${definition(s, c).name}.`,
      `${p.name} juega ${definition(s, c).name}.`,
    );
  } else if (action.type === "tapMana") {
    const c = instance(s, action.card);
    const color = manaColor(s, c);
    requireRule(
      c.zone === "battlefield" &&
        c.controller === action.player &&
        !c.tapped &&
        !summoningSick(s, c) &&
        color,
      "mana",
    );
    c.tapped = true;
    p.mana[color]++;
    s.passes = 0;
  } else if (action.type === "cast") {
    const c = instance(s, action.card);
    const d = definition(s, c);
    requireRule(
      c.owner === action.player &&
        (c.zone === "hand" || (c.zone === "command" && c.commander)) &&
        !d.typeLine.includes("Land"),
      "cast",
    );
    requireRule(
      d.typeLine.includes("Instant") ||
        (action.player === s.active &&
          ["main1", "main2"].includes(s.step) &&
          !s.stack.length),
      "timing",
    );
    requireRule(d.effect !== "manual" || action.manual, "unsupported");
    requireRule(validTarget(s, d.effect, action.target), "target");
    const paid = payment(s, action.player, c, action.autoPay);
    requireRule(paid, "mana");
    p.mana = paid.mana;
    for (const id of paid.used) instance(s, id).tapped = true;
    if (c.zone === "command") c.casts++;
    move(s, c, "stack", false);
    c.controller = action.player;
    s.stack.push({
      id: `s${s.nextId++}`,
      card: c.id,
      controller: action.player,
      effect: d.effect,
      target:
        action.target && "card" in action.target
          ? {
              ...action.target,
              incarnation: instance(s, action.target.card).incarnation,
            }
          : action.target,
      ability: false,
    });
    s.passes = 0;
    log(s, `${p.name} casts ${d.name}.`, `${p.name} lanza ${d.name}.`);
  } else if (action.type === "activate") {
    const c = instance(s, action.card);
    requireRule(
      c.zone === "battlefield" &&
        c.controller === action.player &&
        definition(s, c).effect === "petitioners" &&
        s.players[action.target] &&
        !s.players[action.target].lost,
      "target",
    );
    if (action.group) {
      requireRule(
        action.group.length === 4 &&
          new Set(action.group).size === 4 &&
          action.group.every((id) =>
            inZone(s, action.player, "battlefield").some(
              (x) =>
                x.id === id &&
                !x.tapped &&
                definition(s, x).typeLine.includes("Advisor"),
            ),
          ),
        "ability",
      );
      for (const id of action.group) instance(s, id).tapped = true;
    } else {
      requireRule(!c.tapped && !summoningSick(s, c), "ability");
      const dummy = { ...c, def: "generic-one" };
      s.definitions[dummy.def] = {
        ...definition(s, c),
        id: dummy.def,
        manaCost: "{1}",
      };
      const paid = payment(s, action.player, dummy, true);
      delete s.definitions[dummy.def];
      requireRule(paid && !paid.used.includes(c.id), "mana");
      p.mana = paid.mana;
      for (const id of paid.used) instance(s, id).tapped = true;
      c.tapped = true;
    }
    s.stack.push({
      id: `s${s.nextId++}`,
      card: c.id,
      controller: action.player,
      effect: action.group ? "mill12" : "mill1",
      target: { player: action.target },
      ability: true,
    });
    s.passes = 0;
  } else if (action.type === "attack") {
    requireRule(
      s.step === "attackers" &&
        s.declaration &&
        action.player === s.active &&
        new Set(action.attacks.map((a) => a.card)).size ===
          action.attacks.length,
      "attack",
    );
    for (const attack of action.attacks) {
      const c = instance(s, attack.card);
      requireRule(
        canAttack(s, c) &&
          attack.defender !== action.player &&
          s.players[attack.defender] &&
          !s.players[attack.defender].lost,
        "attack",
      );
      if (!has(s, c, "Vigilance")) c.tapped = true;
    }
    s.attacks = action.attacks.map((a) => ({
      ...a,
      blockers: [],
      blocked: false,
    }));
    s.declaration = false;
    s.passes = 0;
    log(
      s,
      `${p.name} declares ${action.attacks.length} attackers.`,
      `${p.name} declara ${action.attacks.length} atacantes.`,
    );
  } else if (action.type === "block") {
    requireRule(
      s.step === "blockers" &&
        s.declaration &&
        new Set(action.blocks.map((b) => b.card)).size === action.blocks.length,
      "block",
    );
    for (const block of action.blocks) {
      const attack = s.attacks.find((a) => a.card === block.attacker);
      const c = instance(s, block.card);
      requireRule(
        attack?.defender === action.player &&
          c.controller === action.player &&
          canBlock(s, c, instance(s, attack.card)),
        "block",
      );
      attack.blockers.push(c.id);
      attack.blocked = true;
    }
    for (const attack of s.attacks.filter((a) => a.defender === action.player))
      if (has(s, instance(s, attack.card), "Menace"))
        requireRule(attack.blockers.length !== 1, "menace");
    const defenders = living(s).filter((i) =>
      s.attacks.some((a) => a.defender === i),
    );
    const ordered = Array.from(
      { length: s.players.length },
      (_, n) => (s.active + n + 1) % s.players.length,
    ).filter((i) => defenders.includes(i));
    if (action.player === ordered.at(-1)) {
      s.declaration = false;
      s.priority = s.active;
    } else s.priority = nextDefender(s, action.player);
    s.passes = 0;
  } else if (action.type === "damage") {
    requireRule(s.damagePending, "damage");
    combatDamage(s);
  } else if (action.type === "discard") {
    requireRule(
      s.step === "cleanup" &&
        action.player === s.active &&
        action.cards.length ===
          Math.max(0, inZone(s, action.player, "hand").length - 7) &&
        new Set(action.cards).size === action.cards.length &&
        action.cards.every((id) =>
          inZone(s, action.player, "hand").some((c) => c.id === id),
        ),
      "discard",
    );
    for (const id of action.cards) move(s, instance(s, id), "graveyard");
  } else throw new GameRuleError("invalid");
  stateBased(s);
  if (s.winner === null && s.players[s.active].lost) advance(s);
  return s;
}

/** A conservative local player. It uses only its own hand and public zones. */
export function automaticAction(s: Game): Action | null {
  if (s.winner !== null) return null;
  const player = actingPlayer(s);
  const p = s.players[player];
  if (s.commanderChoices.length)
    return {
      type: "commander",
      player,
      card: s.commanderChoices[0].card,
      command: true,
    };
  requireRule(!needsManual(s) && !s.manualResolution, "unsupported");
  const hand = inZone(s, player, "hand");
  const board = inZone(s, player, "battlefield");
  const enemy = nextPlayer(s, player);
  if (s.opening) {
    const lands = hand.filter((c) => definition(s, c).effect === "land");
    if ((lands.length < 2 || lands.length > 5) && p.mulligans < 2)
      return { type: "mulligan", player };
    const sorted = [...hand].sort(
      (a, b) =>
        Number(definition(s, a).effect === "land") -
        Number(definition(s, b).effect === "land"),
    );
    return {
      type: "keep",
      player,
      bottom: sorted.slice(0, bottomCount(s, player)).map((c) => c.id),
    };
  }
  if (s.step === "untap") return { type: "pass", player };
  if (s.declaration && s.step === "attackers")
    return {
      type: "attack",
      player,
      attacks: board
        .filter((c) => canAttack(s, c) && stats(s, c).power > 0)
        .map((c) => ({ card: c.id, defender: enemy })),
    };
  if (s.declaration && s.step === "blockers") {
    const available = board.filter((c) => creature(s, c) && !c.tapped);
    const blocks: { card: string; attacker: string }[] = [];
    for (const attack of s.attacks.filter((a) => a.defender === player)) {
      const attacker = instance(s, attack.card);
      const choices = available.filter(
        (c) => !blocks.some((b) => b.card === c.id) && canBlock(s, c, attacker),
      );
      const count = has(s, attacker, "Menace") ? 2 : 1;
      if (choices.length >= count)
        for (const blocker of choices.slice(0, count))
          blocks.push({ card: blocker.id, attacker: attacker.id });
    }
    return { type: "block", player, blocks };
  }
  if (s.damagePending) return { type: "damage", player };
  if (s.step === "cleanup" && !s.cleanupPriority)
    return hand.length > 7
      ? { type: "discard", player, cards: hand.slice(7).map((c) => c.id) }
      : { type: "pass", player };
  const payable = hand.filter((c) => payment(s, player, c));
  const top = s.stack.at(-1);
  const counter = payable.find((c) => definition(s, c).effect === "counter");
  if (counter && top && top.controller !== player && !top.ability)
    return {
      type: "cast",
      player,
      card: counter.id,
      target: { spell: top.id },
      autoPay: true,
    };
  if (s.stack.length) return { type: "pass", player };
  if (s.active === player && ["main1", "main2"].includes(s.step)) {
    const land = hand.find((c) => definition(s, c).effect === "land");
    if (land && p.lands === 0) return { type: "land", player, card: land.id };
    const playable = [...hand, ...inZone(s, player, "command")].find(
      (c) =>
        payment(s, player, c) &&
        (creature(s, c) ||
          ["draw2", "slime"].includes(definition(s, c).effect)),
    );
    if (playable)
      return { type: "cast", player, card: playable.id, autoPay: true };
  }
  const advisors = board.filter(
    (c) => !c.tapped && definition(s, c).typeLine.includes("Advisor"),
  );
  const petitioner = board.find(
    (c) => definition(s, c).effect === "petitioners",
  );
  if (petitioner && advisors.length >= 4)
    return {
      type: "activate",
      player,
      card: petitioner.id,
      group: advisors.slice(0, 4).map((c) => c.id),
      target: enemy,
    };
  const bolt = payable.find((c) => definition(s, c).effect === "bolt");
  if (bolt)
    return {
      type: "cast",
      player,
      card: bolt.id,
      target: { player: enemy },
      autoPay: true,
    };
  if (["blockers", "beginCombat"].includes(s.step)) {
    const growth = payable.find((c) => definition(s, c).effect === "growth");
    const target = board.find(
      (c) =>
        creature(s, c) &&
        s.attacks.some((a) => a.card === c.id || a.blockers.includes(c.id)),
    );
    if (growth && target)
      return {
        type: "cast",
        player,
        card: growth.id,
        target: { card: target.id },
        autoPay: true,
      };
  }
  const bounce = payable.find((c) => definition(s, c).effect === "bounce");
  const target = inZone(s, enemy, "battlefield").find((c) => creature(s, c));
  if (bounce && target && s.step === "beginCombat")
    return {
      type: "cast",
      player,
      card: bounce.id,
      target: { card: target.id },
      autoPay: true,
    };
  return { type: "pass", player };
}

export function restoreGame(text: string): Game | null {
  try {
    if (text.length > 2000000) return null;
    const s = JSON.parse(text) as Game;
    if (
      s.version !== 1 ||
      !Array.isArray(s.players) ||
      s.players.length < 2 ||
      s.players.length > 4 ||
      !Array.isArray(s.cards) ||
      s.cards.length > 900 ||
      !Array.isArray(s.stack) ||
      s.stack.length > 200 ||
      !STEPS.includes(s.step) ||
      !s.definitions ||
      !Array.isArray(s.commanderChoices) ||
      !Array.isArray(s.attacks) ||
      !Array.isArray(s.firstStrikers) ||
      !Array.isArray(s.log)
    )
      return null;
    if (
      ![s.turn, s.nextId, s.active, s.priority, s.seed, s.passes].every(
        Number.isInteger,
      ) ||
      s.turn < 1 ||
      s.active < 0 ||
      s.active >= s.players.length ||
      s.priority < 0 ||
      s.priority >= s.players.length
    )
      return null;
    if (
      new Set(s.cards.map((c) => c.id)).size !== s.cards.length ||
      s.cards.some(
        (c) =>
          !s.definitions[c.def] ||
          !Number.isInteger(c.owner) ||
          c.owner < 0 ||
          c.owner >= s.players.length ||
          !Number.isInteger(c.controller) ||
          c.controller < 0 ||
          c.controller >= s.players.length ||
          ![
            "library",
            "hand",
            "battlefield",
            "graveyard",
            "exile",
            "command",
            "stack",
          ].includes(c.zone) ||
          ![
            c.damage,
            c.counters,
            c.buff,
            c.entered,
            c.casts,
            c.incarnation,
          ].every(Number.isFinite),
      )
    )
      return null;
    if (
      s.players.some(
        (p) =>
          typeof p.name !== "string" ||
          ![p.life, p.poison, p.mulligans, p.lands].every(Number.isFinite) ||
          !p.mana ||
          !COLORS.every((c) => Number.isFinite(p.mana[c])) ||
          !p.commanderDamage,
      )
    )
      return null;
    if (
      Object.values(s.definitions).some(
        (d) =>
          typeof d.name !== "string" ||
          typeof d.typeLine !== "string" ||
          typeof d.manaCost !== "string" ||
          typeof d.oracleText !== "string" ||
          !Array.isArray(d.keywords) ||
          !Array.isArray(d.colorIdentity) ||
          !Number.isFinite(d.power) ||
          !Number.isFinite(d.toughness),
      )
    )
      return null;
    if (
      s.stack.some(
        (x) => !s.cards.some((c) => c.id === x.card) && !x.ability,
      ) ||
      s.commanderChoices.some((x) => !s.cards.some((c) => c.id === x.card))
    )
      return null;
    const effects = [
      "land",
      "creature",
      "elf",
      "bolt",
      "draw2",
      "counter",
      "bounce",
      "growth",
      "rats",
      "petitioners",
      "hare",
      "slime",
      "manual",
    ];
    if (
      ![
        s.opening,
        s.declaration,
        s.damagePending,
        s.cleanupPriority,
        s.manualResolution,
      ].every((x) => typeof x === "boolean") ||
      !(
        s.winner === null ||
        s.winner === "draw" ||
        (Number.isInteger(s.winner) &&
          Number(s.winner) >= 0 &&
          Number(s.winner) < s.players.length)
      )
    )
      return null;
    if (
      s.log.some((x) => typeof x.en !== "string" || typeof x.es !== "string") ||
      s.log.length > 160
    )
      return null;
    if (
      s.cards.some(
        (c) =>
          typeof c.id !== "string" ||
          ![c.tapped, c.deadly, c.token, c.commander].every(
            (x) => typeof x === "boolean",
          ),
      )
    )
      return null;
    if (
      s.players.some(
        (p) =>
          ![p.computer, p.kept, p.lost, p.failedDraw].every(
            (x) => typeof x === "boolean",
          ) || !Object.values(p.commanderDamage).every(Number.isFinite),
      )
    )
      return null;
    if (
      Object.values(s.definitions).some(
        (d) =>
          !effects.includes(d.effect) ||
          !d.keywords.every((k) => typeof k === "string") ||
          !d.colorIdentity.every((k) => typeof k === "string"),
      )
    )
      return null;
    if (
      s.stack.some(
        (x) =>
          ![...effects, "hareTrigger", "mill1", "mill12"].includes(x.effect) ||
          !Number.isInteger(x.controller) ||
          !s.players[x.controller] ||
          typeof x.ability !== "boolean",
      )
    )
      return null;
    if (
      s.attacks.some(
        (a) =>
          !s.cards.some((c) => c.id === a.card) ||
          !s.players[a.defender] ||
          !Array.isArray(a.blockers) ||
          !a.blockers.every((id) => s.cards.some((c) => c.id === id)),
      )
    )
      return null;
    for (const d of Object.values(s.definitions)) {
      if (d.imageUrl && !/^https:\/\/cards\.scryfall\.io\//.test(d.imageUrl))
        delete d.imageUrl;
      if (
        d.sourceUrl &&
        !/^https:\/\/(scryfall\.com|magic\.wizards\.com)\//.test(d.sourceUrl)
      )
        delete d.sourceUrl;
    }
    return s;
  } catch {
    return null;
  }
}
