import type { Action, CardDefinition, Deck, Game } from "./engine";
import type { DeckInput } from "./decks";

export type RoomSeat = {
  name: string;
  userId: string | null;
  computer: boolean;
  input: DeckInput | null;
  deck: Deck | null;
  manual: boolean;
};
export type RoomState = {
  seats: RoomSeat[];
  game: Game | null;
  manual: boolean;
  aiError: string | null;
};
export type Room = {
  id: string;
  hostUserId: string;
  revision: number;
  expiresAt: string;
  state: RoomState;
};
export type RoomView = {
  id: string;
  revision: number;
  expiresAt: string;
  host: boolean;
  seat: number;
  joined: boolean;
  started: boolean;
  seats: {
    name: string;
    computer: boolean;
    occupied: boolean;
    ready: boolean;
    manual: boolean;
  }[];
  input: DeckInput | null;
  game: Game | null;
  manual: boolean;
  aiError: string | null;
};
export class RoomError extends Error {
  code: string;
  status: number;
  constructor(code: string, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}
export function roomAssert(
  value: unknown,
  code: string,
  status = 400,
): asserts value {
  if (!value) throw new RoomError(code, status);
}
export function parseDeckInput(value: unknown): DeckInput {
  roomAssert(
    value && typeof value === "object" && !Array.isArray(value),
    "invalidDeck",
  );
  const d = value as Record<string, unknown>;
  roomAssert(
    typeof d.name === "string" &&
      d.name.trim().length > 0 &&
      d.name.length <= 60 &&
      typeof d.commander === "string" &&
      d.commander.length <= 500 &&
      typeof d.list === "string" &&
      d.list.length <= 30000,
    "invalidDeck",
  );
  return {
    name: d.name.trim(),
    commander: d.commander,
    list: d.list,
    computer: false,
  };
}
export const seatFor = (room: Room, userId: string) =>
  room.state.seats.findIndex((s) => s.userId === userId);
export function canControlSeat(room: Room, userId: string, seat: number) {
  return (
    room.state.seats[seat]?.userId === userId ||
    (room.hostUserId === userId &&
      room.state.manual &&
      room.state.seats[seat]?.computer)
  );
}
/** Never return deck order, shuffle seed, other hands, user IDs or unpublished deck definitions. */
export function roomView(room: Room, userId: string): RoomView {
  const seat = seatFor(room, userId);
  const joined = seat >= 0;
  const host = room.hostUserId === userId;
  const game =
    joined && room.state.game ? structuredClone(room.state.game) : null;
  if (game) {
    game.seed = 0;
    const hidden: CardDefinition = {
      id: "hidden",
      name: "Hidden card",
      typeLine: "Hidden",
      manaCost: "",
      oracleText: "",
      keywords: [],
      colorIdentity: [],
      power: 0,
      toughness: 0,
      effect: "manual",
    };
    const visible = new Set<string>();
    const counts = new Map<string, number>();
    game.cards = game.cards.map((c) => {
      if (
        !game!.commanderChoices.some((choice) => choice.card === c.id) &&
        (c.zone === "library" ||
          (c.zone === "hand" && !canControlSeat(room, userId, c.owner)))
      ) {
        const key = `${c.owner}-${c.zone}`;
        const n = counts.get(key) ?? 0;
        counts.set(key, n + 1);
        visible.add("hidden");
        return {
          ...c,
          id: `hidden-${key}-${n}`,
          def: "hidden",
          commander: false,
          casts: 0,
          entered: 0,
          counters: 0,
          damage: 0,
          buff: 0,
        };
      }
      visible.add(c.def);
      return c;
    });
    game.definitions = Object.fromEntries(
      [...visible].map((id) => [
        id,
        id === "hidden" ? hidden : game!.definitions[id],
      ]),
    );
    // Pending hand/library commander choices are delivered only to their owner.
    game.commanderChoices = game.commanderChoices.map((choice) => ({
      ...choice,
      card: game!.cards.some((c) => c.id === choice.card)
        ? choice.card
        : "hidden-commander-choice",
    }));
    // Manual notes are shared explicitly by the table; automatic logs never name drawn/milled cards.
  }
  return {
    id: room.id,
    revision: room.revision,
    expiresAt: room.expiresAt,
    host,
    seat,
    joined,
    started: !!room.state.game,
    seats: room.state.seats.map((s) => ({
      name: s.name,
      computer: s.computer,
      occupied: !!s.userId || s.computer,
      ready: !!s.deck,
      manual: s.manual,
    })),
    input: joined ? room.state.seats[seat].input : null,
    game,
    manual: room.state.manual,
    aiError: room.state.aiError,
  };
}
export function authorizeAction(
  room: Room,
  userId: string,
  raw: unknown,
): Action {
  roomAssert(room.state.game && seatFor(room, userId) >= 0, "notPlaying", 403);
  roomAssert(
    raw && typeof raw === "object" && !Array.isArray(raw),
    "invalidAction",
  );
  const a = raw as Action;
  roomAssert(
    typeof a.type === "string" &&
      Number.isInteger(a.player) &&
      !!room.state.seats[a.player],
    "invalidAction",
  );
  roomAssert(
    [
      "pass",
      "mulligan",
      "keep",
      "land",
      "tapMana",
      "cast",
      "activate",
      "attack",
      "block",
      "damage",
      "discard",
      "commander",
      "resolveManual",
      "manual",
      "concede",
    ].includes(a.type),
    "invalidAction",
  );
  if (a.type === "manual") {
    roomAssert(room.hostUserId === userId, "hostRuling", 403);
    roomAssert(typeof a.note === "string", "invalidAction");
  } else roomAssert(canControlSeat(room, userId, a.player), "notYourSeat", 403);
  if (["keep", "discard"].includes(a.type))
    roomAssert(
      Array.isArray(
        a.type === "keep"
          ? a.bottom
          : (a as Extract<Action, { type: "discard" }>).cards,
      ),
      "invalidAction",
    );
  if (a.type === "attack")
    roomAssert(
      Array.isArray(a.attacks) && a.attacks.length <= 900,
      "invalidAction",
    );
  if (a.type === "block")
    roomAssert(
      Array.isArray(a.blocks) && a.blocks.length <= 900,
      "invalidAction",
    );
  if (a.type === "resolveManual")
    roomAssert(
      typeof a.note === "string" && a.note.length <= 500,
      "invalidAction",
    );
  // Hidden-zone IDs and arbitrary opponent cards cannot be submitted through the manual toolbox.
  if (a.type === "manual" && a.card) {
    const card = room.state.game.cards.find((c) => c.id === a.card);
    roomAssert(
      card &&
        card.zone !== "library" &&
        (card.zone !== "hand" || canControlSeat(room, userId, card.owner)),
      "hiddenCard",
      403,
    );
  }

  return a;
}
