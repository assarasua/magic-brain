import { buildDeck, PRESETS, type DeckInput } from "./decks.ts";
import {
  actingPlayer,
  applyAction,
  automaticAction,
  createGame,
  GameRuleError,
  type Deck,
} from "./engine.ts";
import {
  authorizeAction,
  roomAssert,
  RoomError,
  seatFor,
  type Room,
} from "./rooms.ts";
export function applyRoomChange(
  previous: Room,
  userId: string,
  body: Record<string, unknown>,
  input: DeckInput | null = null,
  prepared: { deck: Deck; manual: boolean } | null = null,
  seed = 1,
): Room {
  const room = structuredClone(previous);
  roomAssert(room.revision === body.revision, "staleRoom", 409);
  const state = room.state;
  const seat = seatFor(room, userId);
  const host = room.hostUserId === userId;
  if (body.type === "join") {
    roomAssert(!state.game, "alreadyStarted");
    roomAssert(seat < 0, "alreadyJoined");
    const empty = state.seats.find((s) => !s.userId && !s.computer);
    roomAssert(empty, "roomFull", 409);
    roomAssert(
      typeof body.name === "string" &&
        body.name.trim().length > 0 &&
        body.name.length <= 60,
      "invalidName",
    );
    empty.userId = userId;
    empty.name = body.name.trim();
  } else {
    roomAssert(seat >= 0, "notJoined", 403);
    if (body.type === "deck") {
      roomAssert(!state.game && input && prepared, "alreadyStarted");
      Object.assign(state.seats[seat], {
        input,
        deck: prepared.deck,
        manual: prepared.manual,
        name: input.name,
      });
    } else if (body.type === "computer") {
      roomAssert(host && !state.game, "hostOnly", 403);
      const index = Number(body.seat);
      const slot = state.seats[index];
      roomAssert(
        slot && !slot.userId && Number.isInteger(index),
        "occupiedSeat",
      );
      roomAssert(typeof body.enabled === "boolean", "invalidAction");
      if (body.enabled) {
        const preset = PRESETS.find((p) => p.id === body.preset);
        roomAssert(preset, "invalidDeck");
        const input = {
          name: `Computer ${index + 1}`,
          commander: preset.commander,
          list: preset.list,
          computer: true,
        };
        Object.assign(slot, {
          name: input.name,
          computer: true,
          input,
          deck: buildDeck(input).deck,
          manual: false,
        });
      } else
        Object.assign(slot, {
          name: `Player ${index + 1}`,
          computer: false,
          input: null,
          deck: null,
          manual: false,
        });
    } else if (body.type === "start") {
      roomAssert(host && !state.game, "hostOnly", 403);
      roomAssert(
        state.seats.every((s) => s.deck && (s.userId || s.computer)),
        "notReady",
      );
      state.manual = state.seats.some((s) => s.manual);
      roomAssert(
        !state.manual || !state.seats.some((s) => s.computer),
        "manualAi",
      );
      state.game = createGame(
        state.seats.map((s) => s.deck!),
        seed,
      );
    } else if (body.type === "leave") {
      roomAssert(!state.game && !host, "cannotLeave");
      Object.assign(state.seats[seat], {
        name: `Player ${seat + 1}`,
        userId: null,
        input: null,
        deck: null,
        manual: false,
      });
    } else if (body.type === "action") {
      const action = authorizeAction(room, userId, body.action);
      try {
        state.game = applyAction(state.game!, action);
      } catch (e) {
        if (e instanceof GameRuleError) throw new RoomError(e.code);
        throw new RoomError("invalidAction");
      }
      if (action.type === "manual" || action.type === "resolveManual")
        state.manual = true;
      state.aiError = null;
    } else if (body.type !== "tick") throw new RoomError("invalidAction");
    if (state.game && !state.manual && !state.aiError) {
      for (
        let i = 0;
        i < 24 &&
        state.game.winner === null &&
        state.seats[actingPlayer(state.game)].computer;
        i++
      ) {
        try {
          const action = automaticAction(state.game);
          if (!action) break;
          state.game = applyAction(state.game, action);
        } catch (e) {
          state.aiError = e instanceof GameRuleError ? e.code : "invalidAction";
          state.manual = true;
          break;
        }
      }
    }
  }
  room.revision++;
  return room;
}
