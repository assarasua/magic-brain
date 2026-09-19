import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildDeck, PRESETS } from "./play/decks.ts";
import { applyRoomChange } from "./play/room-actions.ts";
import { roomView, authorizeAction, parseDeckInput } from "./play/rooms.ts";
import {
  applyAction,
  automaticAction,
  inZone,
  actingPlayer,
} from "./play/engine.ts";
const input = (i = 0) => ({
  name: `Human ${i + 1}`,
  commander: PRESETS[i].commander,
  list: PRESETS[i].list,
  computer: false,
});
function lobby(n = 4) {
  const d = input();
  return {
    id: "00000000-0000-4000-8000-000000000001",
    hostUserId: "host",
    revision: 0,
    expiresAt: "2099-01-01T00:00:00Z",
    state: {
      seats: Array.from({ length: n }, (_, i) => ({
        name: `Human ${i + 1}`,
        userId: i === 0 ? "host" : null,
        computer: false,
        input: i === 0 ? d : null,
        deck: i === 0 ? buildDeck(d).deck : null,
        manual: false,
      })),
      game: null,
      manual: false,
      aiError: null,
    },
  };
}
function change(room, user, type, fields = {}) {
  return applyRoomChange(room, user, {
    type,
    revision: room.revision,
    ...fields,
  });
}
function ready(n = 4) {
  let r = lobby(n);
  for (let i = 1; i < n; i++) {
    r = change(r, `user${i}`, "join", { name: `Human ${i + 1}` });
    const d = input(i);
    r = applyRoomChange(
      r,
      `user${i}`,
      { type: "deck", revision: r.revision },
      d,
      { deck: buildDeck(d).deck, manual: false },
    );
  }
  return r;
}
const fails = (fn, code) => assert.throws(fn, (e) => e.code === code);
test("invite room preview excludes decks, game state and account identifiers", () => {
  const view = roomView(lobby(), "stranger");
  assert.equal(view.joined, false);
  assert.equal(view.game, null);
  assert.equal(view.input, null);
  assert.equal(JSON.stringify(view).includes("userId"), false);
  assert.equal(JSON.stringify(view).includes("Hare Apparent"), false);
});
test("joining consumes one seat per account and rejects stale concurrent joins", () => {
  const r = lobby(2);
  const next = change(r, "guest", "join", { name: "Guest" });
  assert.equal(r.state.seats[1].userId, null);
  assert.equal(next.state.seats[1].userId, "guest");
  fails(
    () =>
      applyRoomChange(next, "other", {
        type: "join",
        name: "Other",
        revision: r.revision,
      }),
    "staleRoom",
  );
  fails(() => change(next, "other", "join", { name: "Other" }), "roomFull");
  fails(
    () => change(next, "guest", "join", { name: "Guest" }),
    "alreadyJoined",
  );
});
test("only the host fills empty seats with computers and starts fully ready rooms", () => {
  let r = lobby(3);
  fails(() => change(r, "host", "start"), "notReady");
  r = change(r, "guest", "join", { name: "Guest" });
  fails(
    () =>
      change(r, "guest", "computer", {
        seat: 2,
        enabled: true,
        preset: "rats",
      }),
    "hostOnly",
  );
  fails(
    () =>
      change(r, "host", "computer", { seat: 1, enabled: true, preset: "rats" }),
    "occupiedSeat",
  );
  r = change(r, "host", "computer", { seat: 2, enabled: true, preset: "rats" });
  assert.equal(r.state.seats[2].computer, true);
  fails(() => change(r, "guest", "start"), "hostOnly");
});
test("players can save only their own deck and rejoin through the same account", () => {
  let r = ready();
  const d = { ...input(0), name: "New name" };
  const next = applyRoomChange(
    r,
    "user1",
    { type: "deck", revision: r.revision },
    d,
    { deck: buildDeck(d).deck, manual: false },
  );
  assert.equal(next.state.seats[1].name, "New name");
  assert.equal(next.state.seats[0].name, "Human 1");
  const view = roomView(next, "user1");
  assert.equal(view.seat, 1);
  assert.equal(view.input.name, "New name");
});
test("remote projections keep own hand while redacting all libraries, other hands and shuffle seed", () => {
  const r = change(ready(), "host", "start");
  const a = roomView(r, "host");
  const b = roomView(r, "user1");
  assert.equal(a.game.seed, 0);
  assert.equal(
    inZone(a.game, 0, "hand").filter((c) => c.def === "hidden").length,
    0,
  );
  assert.equal(
    inZone(a.game, 1, "hand").filter((c) => c.def === "hidden").length,
    7,
  );
  assert.equal(
    inZone(b.game, 0, "hand").filter((c) => c.def === "hidden").length,
    7,
  );
  assert.ok(
    a.game.cards
      .filter((c) => c.zone === "library")
      .every((c) => c.def === "hidden" && c.id.startsWith("hidden-")),
  );
  assert.equal(
    Object.values(a.game.definitions).some((d) => d.name === "Relentless Rats"),
    false,
  );
  assert.equal(roomView(r, "stranger").game, null);
  assert.ok(roomView(r, "stranger").started);
});
test("private pending commander choices remain renderable without exposing unrelated cards", () => {
  let r = change(ready(), "host", "start");
  let g = r.state.game;
  while (g.opening)
    g = applyAction(g, { type: "keep", player: g.priority, bottom: [] });
  const cmd = inZone(g, 1, "command")[0];
  g = applyAction(g, {
    type: "manual",
    player: 1,
    card: cmd.id,
    zone: "hand",
    note: "Return commander to hand",
  });
  r.state.game = g;
  const view = roomView(r, "host");
  assert.equal(actingPlayer(view.game), 1);
  assert.equal(
    inZone(view.game, 1, "hand").filter((c) => c.def !== "hidden").length,
    1,
  );
});
test("one player cannot submit a move as another player, and guests cannot act", () => {
  const r = change(ready(), "host", "start");
  fails(
    () => authorizeAction(r, "host", { type: "keep", player: 1, bottom: [] }),
    "notYourSeat",
  );
  fails(
    () =>
      authorizeAction(r, "stranger", { type: "keep", player: 0, bottom: [] }),
    "notPlaying",
  );
  fails(
    () =>
      authorizeAction(r, "user1", {
        type: "manual",
        player: 0,
        note: "Change life",
        life: 1,
      }),
    "hostRuling",
  );
});
test("host cannot inspect or move another player hidden hand by guessing instance IDs", () => {
  const r = change(ready(), "host", "start");
  const hidden = inZone(r.state.game, 1, "hand")[0];
  fails(
    () =>
      authorizeAction(r, "host", {
        type: "manual",
        player: 0,
        card: hidden.id,
        zone: "exile",
        note: "Guess private card",
      }),
    "hiddenCard",
  );
  const top = inZone(r.state.game, 0, "library")[0];
  fails(
    () =>
      authorizeAction(r, "host", {
        type: "manual",
        player: 0,
        card: top.id,
        zone: "hand",
        note: "Guess library order",
      }),
    "hiddenCard",
  );
});
test("duplicate actions with an old revision cannot be applied twice", () => {
  const r = change(ready(), "host", "start");
  const body = {
    type: "action",
    revision: r.revision,
    action: { type: "keep", player: 0, bottom: [] },
  };
  const next = applyRoomChange(r, "host", body);
  assert.equal(next.state.game.priority, 1);
  fails(() => applyRoomChange(next, "host", body), "staleRoom");
});
test("computers act on server and stop when a human has priority", () => {
  let r = lobby(2);
  r = change(r, "host", "computer", { seat: 1, enabled: true, preset: "rats" });
  r = change(r, "host", "start");
  assert.equal(r.state.game.opening, true);
  r = change(r, "host", "action", {
    action: { type: "keep", player: 0, bottom: [] },
  });
  assert.equal(r.state.game.opening, false);
  assert.equal(actingPlayer(r.state.game), 0);
  assert.ok(r.state.game.players[1].kept);
});
test("complete online games support mixed humans and computer opponents", () => {
  let r = ready(3);
  r.state.seats.push({
    name: "Computer 4",
    userId: null,
    computer: true,
    input: { ...input(3), computer: true },
    deck: { ...buildDeck(input(3)).deck, computer: true },
    manual: false,
  });
  r = change(r, "host", "start");
  let count = 0;
  while (r.state.game.winner === null && count++ < 15000) {
    const seat = actingPlayer(r.state.game);
    if (r.state.seats[seat].computer) r = change(r, "host", "tick");
    else
      r = change(r, r.state.seats[seat].userId, "action", {
        action: automaticAction(r.state.game),
      });
  }
  assert.notEqual(r.state.game.winner, null);
  for (const user of ["host", "user1", "user2"])
    assert.ok(roomView(r, user).game);
});
test("custom manual effects cannot silently enter a computer game", () => {
  let r = lobby(2);
  r.state.seats[0].manual = true;
  r = change(r, "host", "computer", { seat: 1, enabled: true, preset: "rats" });
  fails(() => change(r, "host", "start"), "manualAi");
});
test("manual rulings pause computer seats and give the host control of those seats", () => {
  let r = lobby(2);
  r = change(r, "host", "computer", { seat: 1, enabled: true, preset: "rats" });
  r = change(r, "host", "start");
  r = change(r, "host", "action", {
    action: { type: "manual", player: 0, life: 39, note: "Agreed correction" },
  });
  assert.equal(r.state.manual, true);
  const view = roomView(r, "host");
  assert.equal(
    inZone(view.game, 1, "hand").filter((c) => c.def === "hidden").length,
    0,
  );
  assert.doesNotThrow(() =>
    authorizeAction(r, "host", { type: "keep", player: 1, bottom: [] }),
  );
});
test("deck and seat changes are locked after game start", () => {
  const r = change(ready(), "host", "start");
  fails(() => change(r, "user1", "leave"), "cannotLeave");
  fails(
    () => change(r, "stranger", "join", { name: "Late" }),
    "alreadyStarted",
  );
});
test("malformed deck input is bounded and cannot choose its controller flag", () => {
  fails(
    () =>
      parseDeckInput({ name: "x", commander: "x", list: "x".repeat(30001) }),
    "invalidDeck",
  );
  const d = parseDeckInput({ ...input(), computer: true });
  assert.equal(d.computer, false);
});
test("durable storage serializes writes under a row lock and never caches private room responses", async () => {
  const store = await readFile(
    new URL("./play/room-store.ts", import.meta.url),
    "utf8",
  );
  assert.ok(store.includes("for update"));
  assert.ok(
    store.indexOf("for update") < store.indexOf("const next = applyRoomChange"),
  );
  assert.ok(store.includes('await client.query("rollback")'));
  const http = await readFile(
    new URL("./play/room-http.ts", import.meta.url),
    "utf8",
  );
  assert.ok(http.includes("private, no-store"));
  assert.ok(http.includes("origin === request.nextUrl.origin"));
  assert.ok(http.includes("session?.user.authenticated"));
});
