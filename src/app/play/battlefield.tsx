"use client";
/* eslint-disable @next/next/no-img-element */
import { Bot, Crown, Layers, Shield, Users } from "lucide-react";
import {
  actingPlayer,
  creature,
  definition,
  inZone,
  type Game,
  type Target,
  type Zone,
} from "@/lib/play/engine";
import { ZONE_LABELS } from "./game-controls";
import CardTile from "./card-tile";
import styles from "./play.module.css";

export default function Battlefield({
  game,
  es,
  homeSeat,
  selectedId,
  onSelect,
  canControl,
  viewPlayer,
  setViewPlayer,
  zone,
  setZone,
  revealed,
  setRevealed,
  online,
  openingDecision,
}: {
  game: Game;
  es: boolean;
  homeSeat: number;
  selectedId: string;
  onSelect: (id: string) => void;
  canControl: (seat: number) => boolean;
  viewPlayer: number;
  setViewPlayer: (seat: number) => void;
  zone: Zone;
  setZone: (zone: Zone) => void;
  revealed: boolean;
  setRevealed: (value: boolean) => void;
  online: boolean;
  openingDecision: boolean;
}) {
  const act = actingPlayer(game);
  const targetName = (target: Target) => {
    if ("player" in target) return game.players[target.player]?.name;
    const id =
      "card" in target
        ? target.card
        : game.stack.find((item) => item.id === target.spell)?.card;
    const found = game.cards.find((card) => card.id === id);
    return found ? definition(game, found).name : es ? "Objetivo" : "Target";
  };
  const openZone = (seat: number, next: Zone) => {
    setViewPlayer(seat);
    setZone(next);
    setRevealed(next === "hand" && seat === homeSeat && canControl(seat));
  };
  const card = (c: Game["cards"][number]) => (
    <CardTile
      key={c.id}
      g={game}
      c={c}
      es={es}
      selected={selectedId === c.id}
      onClick={() => onSelect(c.id)}
    />
  );
  const seat = (i: number) => {
    const p = game.players[i];
    const home = i === homeSeat;
    const commander = game.cards.find((c) => c.owner === i && c.commander);
    const art = commander ? definition(game, commander).imageUrl : undefined;
    const permanents = inZone(game, i, "battlefield");
    const handCount = inZone(game, i, "hand").length;
    return (
      <section
        key={i}
        data-home-seat={home || undefined}
        className={`${styles.playerBoard} ${home ? styles.homeBoard : styles.opponentBoard} ${i === act ? styles.activeBoard : ""} ${p.lost ? styles.lost : ""}`}
        aria-label={`${p.name} ${es ? "campo de batalla" : "battlefield"}`}
      >
        <div className={styles.playerTop}>
          <div className={styles.playerIdentity}>
            <span className={styles.avatar}>
              {art && /^https:\/\/cards\.scryfall\.io\//.test(art) ? (
                <img src={art} alt="" />
              ) : (
                <Crown size={20} />
              )}
            </span>
            <div>
              <span className={styles.seatType}>
                {p.computer ? <Bot size={11} /> : <Users size={11} />}
                {p.computer
                  ? es
                    ? "IA"
                    : "AI"
                  : home
                    ? es
                      ? "TÚ"
                      : "YOU"
                    : es
                      ? "HUMANO"
                      : "HUMAN"}
                {i === act ? ` · ${es ? "DECIDE" : "ACTING"}` : ""}
              </span>
              <h2>{p.name}</h2>
            </div>
          </div>
          <div className={styles.life}>
            <strong>{p.life}</strong>
            <small>
              {es ? "vidas" : "life"}
              {p.poison ? ` · ${p.poison} ☠` : ""}
            </small>
          </div>
        </div>
        {!home && (
          <div
            className={styles.opponentHand}
            aria-label={`${handCount} ${es ? "cartas ocultas" : "hidden cards"}`}
          >
            {Array.from({ length: Math.min(handCount, 9) }, (_, n) => (
              <span className={styles.cardBack} key={n} aria-hidden="true">
                <Crown size={13} />
              </span>
            ))}
            <small>
              {handCount} {es ? "en mano" : "in hand"}
            </small>
          </div>
        )}
        <div className={styles.playmatZones}>
          <div className={styles.commandZone}>
            <span>
              <Crown size={11} />
              {es ? "Comandante" : "Commander"}
            </span>
            <div className={styles.cardRow}>
              {inZone(game, i, "command").map(card)}
            </div>
          </div>
          <div className={styles.permanents}>
            {permanents.length ? (
              <>
                {[true, false].map((isCreature) => (
                  <div className={styles.cardRow} key={String(isCreature)}>
                    {permanents
                      .filter((c) => creature(game, c) === isCreature)
                      .map(card)}
                  </div>
                ))}
              </>
            ) : (
              <div className={styles.emptyBoard}>
                <Shield size={23} />
                <span>{es ? "Campo de batalla" : "Battlefield"}</span>
              </div>
            )}
          </div>
          <button
            className={styles.libraryPile}
            onClick={() => openZone(i, "library")}
            aria-label={`${p.name} · ${es ? "Biblioteca" : "Library"} ${inZone(game, i, "library").length}`}
          >
            <span className={styles.cardBack}>
              <Crown size={20} />
            </span>
            <b>{inZone(game, i, "library").length}</b>
          </button>
        </div>
        <div className={styles.playerBottom}>
          <div className={styles.zoneCounts}>
            {(["hand", "graveyard", "exile"] as Zone[]).map((z) => (
              <button key={z} onClick={() => openZone(i, z)}>
                {ZONE_LABELS[z][es ? 1 : 0]} <b>{inZone(game, i, z).length}</b>
              </button>
            ))}
          </div>
          <span>
            {es ? "Maná" : "Mana"}:{" "}
            {Object.entries(p.mana)
              .filter(([, v]) => v > 0)
              .map(([k, v]) => `${k} ${v}`)
              .join(" · ") || "—"}
          </span>
          {p.lost && <strong>{es ? "Eliminado" : "Eliminated"}</strong>}
          {!!Object.keys(p.commanderDamage).length && (
            <details>
              <summary>
                {es ? "Daño de comandante" : "Commander damage"}
              </summary>
              {Object.entries(p.commanderDamage).map(([id, n]) => (
                <p key={id}>
                  {game.cards.find((c) => c.id === id)
                    ? definition(game, game.cards.find((c) => c.id === id)!)
                        .name
                    : id}
                  : {n}/21
                </p>
              ))}
            </details>
          )}
        </div>
      </section>
    );
  };
  const hidden =
    ["hand", "library"].includes(zone) &&
    (!revealed ||
      (online && (zone === "library" || !canControl(viewPlayer))) ||
      (!online && !canControl(viewPlayer)));
  return (
    <>
      <div className={styles.arena}>
        <div className={styles.opponents} data-seats={game.players.length - 1}>
          {game.players
            .map((_, i) => i)
            .filter((i) => i !== homeSeat)
            .map(seat)}
        </div>
        <section
          className={styles.tableCenter}
          aria-label={es ? "Pila" : "Stack"}
        >
          <div className={styles.centerMark}>
            <Layers size={16} />
            <span>
              {game.stack.length
                ? `${es ? "PILA" : "STACK"} · ${game.stack.length}`
                : "MAGIC BRAIN"}
            </span>
          </div>
          {game.stack.length > 0 ? (
            <ol>
              {[...game.stack].reverse().map((s, i) => (
                <li key={s.id}>
                  <button onClick={() => onSelect(s.card)}>
                    <b>{i === 0 ? (es ? "Siguiente" : "Next") : i + 1}</b>{" "}
                    {game.cards.find((c) => c.id === s.card)
                      ? definition(
                          game,
                          game.cards.find((c) => c.id === s.card)!,
                        ).name
                      : es
                        ? "Habilidad"
                        : "Ability"}
                    <small>
                      {game.players[s.controller].name}
                      {s.ability ? (es ? " · habilidad" : " · ability") : ""}
                      {s.target ? ` → ${targetName(s.target)}` : ""}
                    </small>
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <small>
              {es
                ? "Pila vacía · cada jugador tiene prioridad antes de avanzar"
                : "Stack empty · each player gets priority before the next step"}
            </small>
          )}
        </section>
        {seat(homeSeat)}
      </div>
      {!openingDecision && (
        <section
          className={styles.handPanel}
          aria-label={
            es ? "Cartas en mano y otras zonas" : "Hand and other zones"
          }
        >
          <div className={styles.toolbar}>
            <h3>
              {zone === "hand" && viewPlayer === homeSeat
                ? es
                  ? "Tu mano"
                  : "Your hand"
                : ZONE_LABELS[zone][es ? 1 : 0]}{" "}
              <small>
                {game.players[viewPlayer].name} ·{" "}
                {inZone(game, viewPlayer, zone).length}{" "}
                {es ? "cartas" : "cards"}
              </small>
            </h3>
            <details className={styles.zoneBrowser}>
              <summary>{es ? "Ver otras zonas" : "Browse zones"}</summary>
              <div className={styles.toolbar}>
                <select
                  aria-label={es ? "Ver zona de jugador" : "View player zone"}
                  value={viewPlayer}
                  onChange={(e) => {
                    setViewPlayer(Number(e.target.value));
                    setRevealed(false);
                  }}
                >
                  {game.players.map((p, i) => (
                    <option value={i} key={i}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={es ? "Zona a consultar" : "Zone to view"}
                  value={zone}
                  onChange={(e) => {
                    setZone(e.target.value as Zone);
                    setRevealed(false);
                  }}
                >
                  {Object.entries(ZONE_LABELS)
                    .filter(([z]) => z !== "stack")
                    .map(([z, labels]) => (
                      <option key={z} value={z}>
                        {labels[es ? 1 : 0]}
                      </option>
                    ))}
                </select>
              </div>
            </details>
            {["hand", "library"].includes(zone) &&
              canControl(viewPlayer) &&
              (!online || zone === "hand") && (
                <button onClick={() => setRevealed(!revealed)}>
                  {revealed
                    ? es
                      ? "Ocultar cartas"
                      : "Hide cards"
                    : es
                      ? "Mostrar cartas a la mesa"
                      : "Reveal cards to the table"}
                </button>
              )}
            {(viewPlayer !== homeSeat || zone !== "hand") && (
              <button onClick={() => openZone(homeSeat, "hand")}>
                {es ? "Volver a tu mano" : "Back to your hand"}
              </button>
            )}
          </div>
          <div className={styles.handCards}>
            {hidden ? (
              <>
                <div className={styles.hiddenHand}>
                  {Array.from(
                    {
                      length: Math.min(
                        inZone(game, viewPlayer, zone).length,
                        10,
                      ),
                    },
                    (_, i) => (
                      <span className={styles.cardBack} key={i}>
                        <Crown size={30} />
                      </span>
                    ),
                  )}
                </div>
                <p>{es ? "Cartas ocultas" : "Cards hidden"}</p>
              </>
            ) : (
              inZone(game, viewPlayer, zone).map(card)
            )}
          </div>
        </section>
      )}
    </>
  );
}
