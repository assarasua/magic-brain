import test from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  applyAction,
  automaticAction,
  inZone,
  payment,
  stats,
  bottomCount,
  restoreGame,
  needsManual,
  canAttack,
} from "./play/engine.ts";
import {
  PRESETS,
  STARTER_CARDS,
  buildDeck,
  parseDeckList,
  definitionFromLookup,
} from "./play/decks.ts";
const decks = () =>
  PRESETS.map(
    (p, i) => buildDeck({ ...p, name: `Player ${i + 1}`, computer: true }).deck,
  );
const initial = (n = 4) => createGame(decks().slice(0, n), 42);
function main(n = 4) {
  let s = initial(n);
  while (s.opening || s.step !== "main1")
    s = applyAction(
      s,
      s.opening
        ? { type: "keep", player: s.priority, bottom: [] }
        : { type: "pass", player: s.priority },
    );
  return s;
}
function place(s, player, name, zone = "battlefield") {
  const d = STARTER_CARDS.find((c) => c.name === name);
  assert.ok(d, name);
  s.definitions[d.id] = d;
  const c = {
    id: `fixture-${s.nextId++}`,
    def: d.id,
    owner: player,
    controller: player,
    zone,
    tapped: false,
    entered: 0,
    damage: 0,
    deadly: false,
    counters: 0,
    buff: 0,
    token: false,
    commander: false,
    casts: 0,
    incarnation: 0,
  };
  s.cards.push(c);
  return c;
}
function settle(s) {
  const id = s.stack.at(-1)?.id;
  let guard = 20;
  while (s.stack.some((x) => x.id === id) && guard-- > 0)
    s = applyAction(s, { type: "pass", player: s.priority });
  return s;
}
const fails = (s, a, code) =>
  assert.throws(
    () => applyAction(s, a),
    (e) => e.code === code,
  );

test("practice decks each contain 100 legal-color cards and use explicit duplicate exceptions", () => {
  for (const p of PRESETS) {
    const result = buildDeck({ ...p, name: "A", computer: false });
    assert.equal(result.count, 100);
    assert.deepEqual(result.issues, []);
    assert.deepEqual(result.warnings, []);
    assert.deepEqual(result.manual, []);
  }
});
test("imports common deck exports and normalizes a separately selected commander", () => {
  const rows = parseDeckList(
    "Commander\n1 Isamaru, Hound of Konda (CHK) 19\nDeck\n40x Plains\n59 Hare Apparent *F*\nSideboard\n1 Counterspell",
  );
  assert.equal(rows.rows.length, 3);
  assert.equal(rows.rows[0].commander, true);
  assert.equal(rows.rows[1].quantity, 40);
  const result = buildDeck({
    name: "A",
    computer: false,
    commander: "Isamaru, Hound of Konda",
    list: "1 Isamaru, Hound of Konda\n40 Plains\n59 Hare Apparent",
  });
  assert.equal(result.count, 100);
  assert.deepEqual(result.issues, []);
  assert.ok(
    buildDeck({
      name: "A",
      computer: false,
      commander: "0 Bad",
      list: "",
    }).issues.some((x) => x.code === "line"),
  );
});
test("unknown cards stay manual and new Oracle text cannot inherit automation", () => {
  const result = buildDeck({
    ...PRESETS[0],
    name: "A",
    computer: false,
    list: "40 Plains\n58 Hare Apparent\n1 Unknown Card",
  });
  assert.deepEqual(result.manual, ["Unknown Card"]);
  assert.ok(result.warnings.length);
  const d = STARTER_CARDS.find((x) => x.name === "Hare Apparent");
  assert.equal(
    definitionFromLookup({ ...d, oracleId: d.id, oracleText: "Changed text" })
      .effect,
    "manual",
  );
});
test("singleton, commander and color errors are separate from manual coverage", () => {
  const r = buildDeck({
    ...PRESETS[0],
    name: "A",
    computer: false,
    list: "38 Plains\n59 Hare Apparent\n2 Counterspell",
  });
  assert.ok(r.issues.some((x) => x.code === "color"));
  assert.ok(r.issues.some((x) => x.code === "singleton"));
});
test("Commander setup and London mulligan distinguish multiplayer and two players", () => {
  let s = initial();
  assert.equal(s.players[0].life, 40);
  assert.equal(inZone(s, 0, "library").length, 92);
  assert.equal(inZone(s, 0, "command").length, 1);
  s = applyAction(s, { type: "mulligan", player: 0 });
  assert.equal(bottomCount(s, 0), 0);
  s = applyAction(s, { type: "mulligan", player: 0 });
  assert.equal(bottomCount(s, 0), 1);
  fails(s, { type: "keep", player: 0, bottom: [] }, "bottom");
  const duel = applyAction(initial(2), { type: "mulligan", player: 0 });
  assert.equal(bottomCount(duel, 0), 1);
});
test("multiplayer starting player draws; duel starting player skips first draw", () => {
  assert.equal(inZone(main(4), 0, "hand").length, 8);
  assert.equal(inZone(main(2), 0, "hand").length, 7);
});
test("priority and one-land-per-turn restrictions are enforced without mutating input", () => {
  let s = main();
  const land = place(s, 0, "Plains", "hand");
  fails(s, { type: "land", player: 1, card: land.id }, "priority");
  const original = JSON.stringify(s);
  let next = applyAction(s, { type: "land", player: 0, card: land.id });
  assert.equal(JSON.stringify(s), original);
  const other = place(next, 0, "Plains", "hand");
  fails(next, { type: "land", player: 0, card: other.id }, "land");
});
test("command zone casting pays tax again after removal and choice", () => {
  let s = main();
  const cmd = inZone(s, 0, "command")[0];
  place(s, 0, "Plains");
  s = applyAction(s, { type: "cast", player: 0, card: cmd.id, autoPay: true });
  assert.equal(s.stack.length, 1);
  assert.equal(s.cards.find((c) => c.id === cmd.id).casts, 1);
  s = settle(s);
  s = applyAction(s, {
    type: "manual",
    player: 0,
    card: cmd.id,
    zone: "graveyard",
    note: "Destroy commander",
  });
  assert.equal(s.commanderChoices.length, 1);
  s = applyAction(s, {
    type: "commander",
    player: 0,
    card: cmd.id,
    command: true,
  });
  assert.equal(
    payment(
      s,
      0,
      s.cards.find((c) => c.id === cmd.id),
    ),
    null,
  );
  place(s, 0, "Plains");
  place(s, 0, "Plains");
  place(s, 0, "Plains");
  assert.equal(
    payment(
      s,
      0,
      s.cards.find((c) => c.id === cmd.id),
    ).used.length,
    3,
  );
});
test("stack uses all living players passing and resolves last in first out", () => {
  let s = main();
  const bolt = place(s, 0, "Lightning Bolt", "hand");
  place(s, 0, "Mountain");
  s = applyAction(s, {
    type: "cast",
    player: 0,
    card: bolt.id,
    target: { player: 1 },
    autoPay: true,
  });
  s = applyAction(s, { type: "pass", player: 0 });
  const counter = place(s, 1, "Counterspell", "hand");
  place(s, 1, "Island");
  place(s, 1, "Island");
  s = applyAction(s, {
    type: "cast",
    player: 1,
    card: counter.id,
    target: { spell: s.stack[0].id },
    autoPay: true,
  });
  s = settle(s);
  assert.equal(s.stack.length, 0);
  assert.equal(s.players[1].life, 40);
  assert.equal(s.cards.find((c) => c.id === bolt.id).zone, "graveyard");
});
test("Hare triggered ability survives source leaving battlefield", () => {
  let s = main();
  place(s, 0, "Hare Apparent");
  const hare = place(s, 0, "Hare Apparent", "hand");
  place(s, 0, "Plains");
  place(s, 0, "Plains");
  s = applyAction(s, { type: "cast", player: 0, card: hare.id, autoPay: true });
  s = settle(s);
  assert.equal(s.stack[0].effect, "hareTrigger");
  s = applyAction(s, {
    type: "manual",
    player: 0,
    card: hare.id,
    zone: "graveyard",
    note: "Remove the source",
  });
  s = settle(s);
  assert.equal(inZone(s, 0, "battlefield").filter((c) => c.token).length, 1);
});
test("Slime counts graveyard and exile but not the resolving spell", () => {
  let s = main();
  place(s, 0, "Slime Against Humanity", "graveyard");
  place(s, 0, "Slime Against Humanity", "exile");
  const slime = place(s, 0, "Slime Against Humanity", "hand");
  for (let i = 0; i < 3; i++) place(s, 0, "Forest");
  s = applyAction(s, {
    type: "cast",
    player: 0,
    card: slime.id,
    autoPay: true,
  });
  s = settle(s);
  const ooze = inZone(s, 0, "battlefield").find((c) => c.token);
  assert.equal(stats(s, ooze).power, 4);
});
test("Rats count other named Rats across opponents", () => {
  const s = main();
  const rat = place(s, 0, "Relentless Rats");
  place(s, 1, "Relentless Rats");
  place(s, 2, "Relentless Rats");
  assert.equal(stats(s, rat).power, 4);
});
test("Petitioners may tap four summoning sick Advisors for the non-tap-symbol cost", () => {
  let s = main();
  const group = Array.from({ length: 4 }, () => {
    const c = place(s, 0, "Persistent Petitioners");
    c.entered = s.turn;
    return c.id;
  });
  s = applyAction(s, {
    type: "activate",
    player: 0,
    card: group[0],
    group,
    target: 1,
  });
  const before = inZone(s, 1, "library").length;
  s = settle(s);
  assert.equal(inZone(s, 1, "library").length, before - 12);
});
test("combat damage is simultaneous; trample and commander damage are applied", () => {
  let s = main();
  const a = place(s, 0, "Colossal Dreadmaw");
  a.commander = true;
  a.counters = 16;
  const b = place(s, 1, "Grizzly Bears");
  s.step = "damage";
  s.damagePending = true;
  s.attacks = [{ card: a.id, defender: 1, blockers: [b.id], blocked: true }];
  s = applyAction(s, { type: "damage", player: 0 });
  assert.equal(s.players[1].life, 20);
  assert.equal(s.players[1].commanderDamage[a.id], 20);
  assert.equal(s.cards.find((c) => c.id === a.id).damage, 2);
  assert.equal(s.cards.find((c) => c.id === b.id).zone, "graveyard");
});
test("first strike removes a blocker before normal damage", () => {
  let s = main();
  const a = place(s, 0, "Youthful Knight");
  const b = place(s, 1, "Grizzly Bears");
  s.step = "firstStrike";
  s.damagePending = true;
  s.attacks = [{ card: a.id, defender: 1, blockers: [b.id], blocked: true }];
  s = applyAction(s, { type: "damage", player: 0 });
  assert.equal(s.cards.find((c) => c.id === b.id).zone, "graveyard");
  assert.equal(s.cards.find((c) => c.id === a.id).damage, 0);
  s.step = "damage";
  s.damagePending = true;
  s = applyAction(s, { type: "damage", player: 0 });
  assert.equal(s.players[1].life, 40);
});
test("a blocked attacker stays blocked when its blocker leaves", () => {
  let s = main();
  const a = place(s, 0, "Grizzly Bears");
  const b = place(s, 1, "Grizzly Bears");
  s.attacks = [{ card: a.id, defender: 1, blockers: [b.id], blocked: true }];
  s = applyAction(s, {
    type: "manual",
    player: 1,
    card: b.id,
    zone: "hand",
    note: "Return the blocker",
  });
  s.step = "damage";
  s.damagePending = true;
  s = applyAction(s, { type: "damage", player: 0 });
  assert.equal(s.players[1].life, 40);
});
test("summoning sickness and losing from 21 commander damage", () => {
  let s = main();
  const c = place(s, 0, "Isamaru, Hound of Konda");
  c.entered = s.turn;
  c.commander = true;
  assert.equal(canAttack(s, c), false);
  s = applyAction(s, {
    type: "manual",
    player: 1,
    commanderDamage: { source: c.id, amount: 21 },
    note: "Record commander combat damage",
  });
  assert.equal(s.players[1].lost, true);
  assert.ok(s.cards.every((c) => c.owner !== 1));
});
test("cleanup discards to seven and ends temporary buffs and damage", () => {
  let s = main();
  const c = place(s, 0, "Grizzly Bears");
  c.damage = 1;
  c.buff = 3;
  s.step = "cleanup";
  fails(s, { type: "pass", player: 0 }, "discard");
  const excess = inZone(s, 0, "hand")
    .slice(7)
    .map((c) => c.id);
  s = applyAction(s, { type: "discard", player: 0, cards: excess });
  s = applyAction(s, { type: "pass", player: 0 });
  assert.equal(s.turn, 2);
  assert.equal(s.cards.find((x) => x.id === c.id).buff, 0);
  assert.equal(s.cards.find((x) => x.id === c.id).damage, 0);
});
test("unknown effects cannot silently run automatically; saves reject corrupt state", () => {
  let s = main();
  s.definitions[s.cards[0].def].effect = "manual";
  assert.equal(needsManual(s), true);
  assert.throws(
    () => automaticAction(s),
    (e) => e.code === "unsupported",
  );
  assert.ok(restoreGame(JSON.stringify(s)));
  assert.equal(restoreGame('{"version":1}'), null);
  s.players[0].life = "bad";
  assert.equal(restoreGame(JSON.stringify(s)), null);
});
test("computer decisions do not depend on opponents hidden hand identities", () => {
  const s = main();
  const before = automaticAction(s);
  for (const c of inZone(s, 1, "hand"))
    c.def = STARTER_CARDS.find((c) => c.name === "Counterspell").id;
  s.definitions[STARTER_CARDS.find((c) => c.name === "Counterspell").id] =
    STARTER_CARDS.find((c) => c.name === "Counterspell");
  assert.deepEqual(automaticAction(s), before);
});
test("two, three and four-player practice games reach a winner with legal automatic actions", () => {
  for (const n of [2, 3, 4]) {
    let s = initial(n);
    let actions = 0;
    while (s.winner === null && actions++ < 18000)
      s = applyAction(s, automaticAction(s));
    assert.notEqual(s.winner, null, `${n} players, turn ${s.turn}`);
    assert.ok(actions < 18000);
    assert.ok(restoreGame(JSON.stringify(s)));
  }
});

test("a returned creature is a new object for an already-targeted spell", () => {
  let s = main();
  const bear = place(s, 1, "Grizzly Bears");
  const bolt = place(s, 0, "Lightning Bolt", "hand");
  place(s, 0, "Mountain");
  s = applyAction(s, {
    type: "cast",
    player: 0,
    card: bolt.id,
    target: { card: bear.id },
    autoPay: true,
  });
  s = applyAction(s, {
    type: "manual",
    player: 1,
    card: bear.id,
    zone: "hand",
    note: "Return targeted creature",
  });
  s = applyAction(s, {
    type: "manual",
    player: 1,
    card: bear.id,
    zone: "battlefield",
    note: "Replay as a new object",
  });
  s = settle(s);
  assert.equal(s.cards.find((c) => c.id === bear.id).zone, "battlefield");
  assert.equal(s.cards.find((c) => c.id === bear.id).damage, 0);
});
test("Hare trigger counts its source if that card left and returned as a new object", () => {
  let s = main();
  const hare = place(s, 0, "Hare Apparent", "hand");
  place(s, 0, "Plains");
  place(s, 0, "Plains");
  s = applyAction(s, { type: "cast", player: 0, card: hare.id, autoPay: true });
  s = settle(s);
  s = applyAction(s, {
    type: "manual",
    player: 0,
    card: hare.id,
    zone: "hand",
    note: "Return Hare",
  });
  s = applyAction(s, {
    type: "manual",
    player: 0,
    card: hare.id,
    zone: "battlefield",
    note: "Return as new object",
  });
  s = settle(s);
  assert.equal(inZone(s, 0, "battlefield").filter((c) => c.token).length, 1);
});
