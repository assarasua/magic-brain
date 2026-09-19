import { randomUUID, randomBytes } from "node:crypto";
import { db, query } from "@/lib/db";
import {
  buildDeck,
  deckRows,
  definitionFromLookup,
  STARTER_CARDS,
  type DeckInput,
} from "./decks";
import type { CardDefinition } from "./engine";
import {
  parseDeckInput,
  roomAssert,
  roomView,
  type Room,
  type RoomState,
} from "./rooms";
import { applyRoomChange } from "./room-actions";

type Row = {
  id: string;
  host_user_id: string;
  revision: number;
  state: RoomState;
  expires_at: string;
};
const fromRow = (r: Row): Room => ({
  id: r.id,
  hostUserId: r.host_user_id,
  revision: r.revision,
  state: r.state,
  expiresAt: new Date(r.expires_at).toISOString(),
});
export async function resolveRoomDeck(input: DeckInput) {
  const parsed = deckRows(input);
  roomAssert(
    !parsed.errors.length &&
      parsed.rows.reduce((n, r) => n + r.quantity, 0) === 100,
    "invalidDeck",
  );
  const names = [
    ...new Set(parsed.rows.map((r) => r.name.toLowerCase())),
  ].filter((name) => !STARTER_CARDS.some((c) => c.name.toLowerCase() === name));
  const extra: CardDefinition[] = [];
  if (names.length) {
    const result = await query<{
      oracle_id: string;
      name: string;
      mana_cost: string;
      type_line: string;
      oracle_text: string;
      keywords: string[];
      faces: { power?: string; toughness?: string }[];
      source_url: string;
      color_identity: string[] | null;
      image_url: string | null;
    }>(
      `select distinct on (lower(o.name)) o.oracle_id::text, o.name, o.mana_cost, o.type_line, o.oracle_text, o.keywords, o.faces, o.source_url, p.color_identity, p.image_url
       from app_oracle_cards o join app_rules_datasets d on d.id=o.dataset_id and d.is_active=true
       left join lateral (select color_identity, coalesce(image_url,image_uris->>'normal') as image_url from cards where oracle_id=o.oracle_id order by (lang='en') desc,scryfall_id limit 1) p on true
       where lower(o.name)=any($1::text[]) and o.layout <> 'art_series' and o.type_line !~ '^(Token|Emblem)'
       order by lower(o.name),o.oracle_id`,
      [names],
    );
    for (const r of result.rows)
      extra.push(
        definitionFromLookup(
          {
            oracleId: r.oracle_id,
            name: r.name,
            manaCost: r.mana_cost,
            typeLine: r.type_line,
            oracleText: r.oracle_text,
            keywords: r.keywords,
            faces: r.faces,
            sourceUrl: r.source_url,
          },
          {
            colorIdentity: r.color_identity ?? undefined,
            imageUrl: r.image_url ?? undefined,
          },
        ),
      );
  }
  const built = buildDeck(input, extra);
  roomAssert(!built.issues.length, "invalidDeck");
  return {
    deck: built.deck,
    manual: !!(built.manual.length || built.warnings.length),
  };
}
export async function getRoom(id: string, userId: string) {
  // A transaction bypasses Hyperdrive's query cache: room polling must see
  // the latest committed revision, even when another player made the move.
  const client = await db.connect();
  try {
    await client.query("begin");
    const result = await client.query<Row>(
      "select id,host_user_id,revision,state,expires_at::text from app_play_rooms where id=$1 and expires_at>now()",
      [id],
    );
    roomAssert(result.rows[0], "roomMissing", 404);
    const view = roomView(fromRow(result.rows[0]), userId);
    await client.query("commit");
    return view;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.release();
  }
}
export async function createRoom(userId: string, raw: unknown) {
  roomAssert(raw && typeof raw === "object", "invalidRoom");
  const body = raw as Record<string, unknown>;
  const input = parseDeckInput(body.input);
  const count = Number(body.players);
  roomAssert(Number.isInteger(count) && count >= 2 && count <= 4, "players");
  const prepared = await resolveRoomDeck(input);
  const room: Room = {
    id: randomUUID(),
    hostUserId: userId,
    revision: 0,
    expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    state: {
      seats: Array.from({ length: count }, (_, i) => ({
        name: i === 0 ? input.name : `Player ${i + 1}`,
        userId: i === 0 ? userId : null,
        computer: false,
        input: i === 0 ? input : null,
        deck: i === 0 ? prepared.deck : null,
        manual: i === 0 ? prepared.manual : false,
      })),
      game: null,
      manual: false,
      aiError: null,
    },
  };
  const client = await db.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [
      `play-create:${userId}`,
    ]);
    const existing = await client.query(
      "select count(*)::int as count from app_play_rooms where host_user_id=$1 and expires_at>now()",
      [userId],
    );
    roomAssert(existing.rows[0].count < 12, "roomLimit", 429);
    await client.query("delete from app_play_rooms where expires_at<now()");
    await client.query(
      "insert into app_play_rooms(id,host_user_id,state,expires_at) values($1,$2,$3::jsonb,$4)",
      [room.id, userId, JSON.stringify(room.state), room.expiresAt],
    );
    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    await client.release();
  }
  return roomView(room, userId);
}
export async function mutateRoom(id: string, userId: string, raw: unknown) {
  roomAssert(
    raw && typeof raw === "object" && !Array.isArray(raw),
    "invalidAction",
  );
  const body = raw as Record<string, unknown>;
  roomAssert(
    typeof body.type === "string" && Number.isInteger(body.revision),
    "invalidAction",
  );
  // Resolve an imported deck outside the row lock; revision check prevents stale overwrites.
  const input = body.type === "deck" ? parseDeckInput(body.input) : null;
  const prepared = input ? await resolveRoomDeck(input) : null;
  const client = await db.connect();
  try {
    await client.query("begin");
    const result = await client.query<Row>(
      "select id,host_user_id,revision,state,expires_at::text from app_play_rooms where id=$1 and expires_at>now() for update",
      [id],
    );
    roomAssert(result.rows[0], "roomMissing", 404);
    const room = fromRow(result.rows[0]);
    const next = applyRoomChange(
      room,
      userId,
      body,
      input,
      prepared,
      randomBytes(4).readUInt32LE(),
    );
    await client.query(
      "update app_play_rooms set state=$2::jsonb,revision=$3,updated_at=now() where id=$1",
      [id, JSON.stringify(next.state), next.revision],
    );
    await client.query("commit");
    return roomView(next, userId);
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    await client.release();
  }
}
