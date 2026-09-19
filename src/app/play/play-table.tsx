"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Crown,
  Flag,
  Layers,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  Swords,
  Undo2,
  Users,
} from "lucide-react";
import { MagicBrainLogo } from "@/components/brand-logo";
import { LanguageToggle, useLanguage } from "@/components/language-provider";
import { STARTER_CARDS } from "@/lib/play/decks";
import {
  STEPS,
  actingPlayer,
  applyAction,
  automaticAction,
  creature,
  createGame,
  definition,
  inZone,
  needsManual,
  restoreGame,
  stats,
  summoningSick,
  type Action,
  type Card,
  type Deck,
  type Game,
  type Zone,
} from "@/lib/play/engine";
import DeckSetup from "./deck-setup";
import OnlineLobby, { roomErrorText } from "./online-lobby";
import { useOnlineRoom } from "./use-online-room";
import ReferencePanel from "./reference-panel";
import {
  CardActions,
  Decisions,
  ManualTools,
  STEP_LABELS,
  ZONE_LABELS,
  gameError,
} from "./game-controls";
import styles from "./play.module.css";

type Table = { game: Game; manual: boolean };
type Mode = "off" | "opponents" | "turn" | "all";
const GAME_KEY = "magic-brain-play-game-v1";
export default function PlayTable() {
  const { locale } = useLanguage();
  const es = locale === "es";
  const online = useOnlineRoom();
  const [table, setTable] = useState<Table | null>(null);
  const [saved, setSaved] = useState<Table | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [mode, setMode] = useState<Mode>("off");
  const [stopTurn, setStopTurn] = useState(0);
  const [historyCount, setHistoryCount] = useState(0);
  const [error, setError] = useState("");
  const [storageError, setStorageError] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [viewPlayer, setViewPlayer] = useState(0);
  const [zone, setZone] = useState<Zone>("hand");
  const [revealed, setRevealed] = useState(false);
  const history = useRef<Table[]>([]);
  const actions = useRef(0);
  const game = online.id ? (online.room?.game ?? undefined) : table?.game;
  const canControl = (seat: number) =>
    !online.id ||
    online.room?.seat === seat ||
    !!(
      online.room?.host &&
      online.room.manual &&
      online.room.seats[seat]?.computer
    );
  const onlineSeat = online.room?.seat;
  useEffect(() => {
    if (onlineSeat === undefined || onlineSeat < 0) return;
    const timer = setTimeout(() => {
      setViewPlayer(onlineSeat);
      setRevealed(true);
    }, 0);
    return () => clearTimeout(timer);
  }, [onlineSeat]);
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const raw = localStorage.getItem(GAME_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        const game = restoreGame(JSON.stringify(parsed.game));
        if (game) setSaved({ game, manual: parsed.manual !== false });
      } catch {
        /* Invalid optional local saves are ignored. */
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!table) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(GAME_KEY, JSON.stringify(table));
        setStorageError(false);
      } catch {
        setStorageError(true);
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [table]);
  const dispatch = useCallback(
    (action: Action) => {
      if (online.id) {
        void online.action(action);
        return;
      }
      if (!table) return;
      try {
        const next = applyAction(table.game, action);
        history.current = [...history.current.slice(-49), table];
        setHistoryCount(history.current.length);
        setTable({
          ...table,
          game: next,
          manual:
            table.manual ||
            action.type === "manual" ||
            action.type === "resolveManual",
        });
        setError("");
      } catch (e) {
        setMode("off");
        setError(gameError(e, es));
      }
    },
    [table, es, online],
  );
  const supported =
    !online.id && !!table && !table.manual && !needsManual(table.game);
  useEffect(() => {
    if (!game || mode === "off") return;
    const timer = setTimeout(
      () => {
        if (
          game.winner !== null ||
          !supported ||
          (mode === "turn" && game.turn !== stopTurn)
        ) {
          setMode("off");
          return;
        }
        if (mode === "opponents" && !game.players[actingPlayer(game)].computer)
          return;
        if (actions.current++ >= 3000) {
          setMode("off");
          setError(
            es
              ? "Pausa tras 3.000 acciones. Puedes reanudar la partida."
              : "Paused after 3,000 actions. You can resume playback.",
          );
          return;
        }
        try {
          const action = automaticAction(game);
          if (action) dispatch(action);
          else setMode("off");
        } catch (e) {
          setMode("off");
          setError(gameError(e, es));
        }
      },
      mode === "all" ? 160 : 420,
    );
    return () => clearTimeout(timer);
  }, [game, mode, stopTurn, supported, dispatch, es]);
  function run(next: Mode) {
    actions.current = 0;
    setStopTurn(game?.turn ?? 0);
    setMode(next);
    setError("");
  }
  function single() {
    if (!game) return;
    setMode("off");
    try {
      const action = automaticAction(game);
      if (action) dispatch(action);
    } catch (e) {
      setError(gameError(e, es));
    }
  }
  function start(decks: Deck[], manual: boolean) {
    history.current = [];
    setHistoryCount(0);
    setTable({
      game: createGame(decks, crypto.getRandomValues(new Uint32Array(1))[0]),
      manual,
    });
    setSelectedId("");
    setViewPlayer(0);
    setRevealed(false);
    setMode("off");
    setError("");
    setResetting(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function undo() {
    const previous = history.current.pop();
    if (previous) {
      setHistoryCount(history.current.length);
      setTable(previous);
      setMode("off");
      setError("");
    }
  }
  const selected = game?.cards.find((c) => c.id === selectedId);
  const selectedDef = game && selected ? definition(game, selected) : undefined;
  const act = game ? actingPlayer(game) : 0;
  const commanderArt = STARTER_CARDS.filter((c) =>
    ["Isamaru, Hound of Konda", "Jasmine Boreal", "Lady Orca"].includes(c.name),
  );
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" aria-label="Magic Brain">
          <MagicBrainLogo />
        </Link>
        <nav>
          <Link href="/play" aria-current="page">
            {es ? "Jugar" : "Play"}
          </Link>
          <Link href="/mcp">MCP</Link>
          <Link href="/webmcp">WebMCP</Link>
          <Link href="/login?callbackUrl=%2Fplay">
            {es ? "Entrar" : "Sign in"}
          </Link>
        </nav>
        <LanguageToggle />
      </header>
      {online.id && !game ? (
        <OnlineLobby online={online} es={es} />
      ) : !game ? (
        <>
          <section className={styles.hero}>
            <div>
              <span className={styles.eyebrow}>
                <Swords size={15} />
                COMMANDER · {es ? "MESA DE PRÁCTICA" : "PRACTICE TABLE"}
              </span>
              <h1>
                {es ? (
                  <>
                    Tu mesa.
                    <br />
                    <em>Tus decisiones.</em>
                  </>
                ) : (
                  <>
                    Your table.
                    <br />
                    <em>Your decisions.</em>
                  </>
                )}
              </h1>
              <p>
                {es
                  ? "Trae tu lista. Reúne hasta cuatro jugadores. Juega cada fase a mano o deja que los mazos compatibles jueguen automáticamente."
                  : "Bring your deck list. Gather up to four players. Play every phase by hand, or let supported decks play automatically."}
              </p>
              <div className={styles.heroFacts}>
                <span>
                  <Users size={17} />
                  2–4 {es ? "jugadores" : "players"}
                </span>
                <span>
                  <Crown size={17} />
                  40 {es ? "vidas" : "life"}
                </span>
                <span>
                  <Layers size={17} />
                  {es ? "Pila y prioridad" : "Stack & priority"}
                </span>
              </div>
              <div className={styles.heroActions}>
                <a className={styles.primary} href="#setup">
                  {es ? "Preparar mesa" : "Set up a table"}
                  <ArrowRight size={17} />
                </a>
                {saved && (
                  <button
                    onClick={() => {
                      setTable(saved);
                      setSaved(null);
                      setMode("off");
                    }}
                  >
                    <RotateCcw size={16} />
                    {es ? "Continuar partida guardada" : "Resume saved game"}
                  </button>
                )}
              </div>
              <small>
                {es
                  ? "Mesa local sin cuenta, o salas online privadas con tu cuenta de Magic Brain."
                  : "Local play without an account, or private online rooms with your Magic Brain account."}
              </small>
            </div>
            <div className={styles.heroArt} aria-hidden="true">
              {commanderArt.map((c) => (
                <img key={c.id} src={c.imageUrl} alt="" />
              ))}
              <span>CHOOSE YOUR COMMANDER</span>
            </div>
          </section>
          <div className={styles.scopeNote}>
            <Bot size={21} />
            <p>
              {es
                ? "Controla cada turno. Automatiza lo que está preparado. Las cartas de práctica tienen efectos implementados; otras cartas se resuelven manualmente, con Oracle y rulings como referencia. No es un motor completo de todas las cartas de Magic."
                : "Control every turn. Automate what is supported. Practice cards have implemented effects; other cards resolve manually, with Oracle and rulings as references. This is not a complete engine for every Magic card."}
            </p>
          </div>
          <div id="setup">
            <div className={styles.modeChoice}>
              <button
                aria-pressed={!online.online}
                className={!online.online ? styles.primary : ""}
                onClick={() => online.setOnline(false)}
              >
                <Bot size={18} />
                {es
                  ? "Mesa local / contra el ordenador"
                  : "Local table / vs computer"}
              </button>
              <button
                aria-pressed={online.online}
                className={online.online ? styles.primary : ""}
                onClick={() => online.setOnline(true)}
              >
                <Users size={18} />
                {es ? "Multijugador online" : "Online multiplayer"}
              </button>
            </div>
            {online.error && (
              <p className={styles.error} role="alert">
                {roomErrorText(online.error, es)}
                {online.error === "signIn" && (
                  <Link href="/login?callbackUrl=%2Fplay">
                    {" "}
                    {es ? "Entrar" : "Sign in"}
                  </Link>
                )}
              </p>
            )}
            {online.online && (
              <p>
                {es
                  ? "Elige tu mazo y el tamaño de la mesa. Invita a humanos o añade ordenadores en la sala."
                  : "Choose your deck and table size. Invite humans or add computer opponents in the room."}
              </p>
            )}
            <DeckSetup
              {...{ es, onStart: start }}
              online={online.online}
              onRoomCreate={online.create}
              roomBusy={online.busy}
            />
          </div>
        </>
      ) : (
        <>
          <section className={styles.gameHeader}>
            <div>
              <span className={styles.eyebrow}>
                COMMANDER · {game.players.length} {es ? "JUGADORES" : "PLAYERS"}
              </span>
              <h1>
                {game.players[game.active].name}
                <span>
                  {es ? "Turno" : "Turn"} {game.turn}
                </span>
              </h1>
              <p>
                {game.opening
                  ? es
                    ? "Elegid las manos iniciales"
                    : "Choose opening hands"
                  : STEP_LABELS[game.step][es ? 1 : 0]}{" "}
                · {es ? "Decide" : "Acting"}:{" "}
                <strong>{game.players[act].name}</strong>
              </p>
            </div>
            <div className={styles.toolbar}>
              <button onClick={undo} disabled={!historyCount || !!online.id}>
                <Undo2 size={15} />
                {es ? "Deshacer" : "Undo"}
              </button>
              <button
                onClick={() => {
                  setMode("off");
                  if (online.id) online.exit();
                  else setResetting(true);
                }}
              >
                <RotateCcw size={15} />
                {es ? "Nueva mesa" : "New table"}
              </button>
            </div>
          </section>
          {resetting && (
            <div className={styles.notice} role="alert">
              <p>
                {es
                  ? "La nueva mesa reemplazará esta partida guardada en el dispositivo."
                  : "The new table will replace this device's saved game."}
              </p>
              <button
                onClick={() => {
                  setTable(null);
                  setSaved(table);
                  setResetting(false);
                }}
              >
                {es ? "Ir a preparación" : "Go to setup"}
              </button>
              <button onClick={() => setResetting(false)}>
                {es ? "Continuar jugando" : "Keep playing"}
              </button>
            </div>
          )}
          {online.id ? (
            <div className={styles.playback}>
              <strong>
                {es
                  ? "Partida online · tu mano es privada"
                  : "Online game · your hand is private"}
              </strong>
              <p>
                {online.room?.manual
                  ? es
                    ? "Mesa manual: el anfitrión aplica las decisiones compartidas y controla los asientos de ordenador."
                    : "Manual table: the host applies shared rulings and controls computer seats."
                  : es
                    ? "Los ordenadores juegan automáticamente. Cada humano controla su propio asiento."
                    : "Computers play automatically. Each human controls their own seat."}
              </p>
              <small>
                {es
                  ? "Actualización cada 2 segundos · vuelve a esta URL para reconectar."
                  : "Updates every 2 seconds · return to this URL to reconnect."}
              </small>
            </div>
          ) : (
            <div className={styles.playback}>
              <div className={styles.toolbar}>
                <button
                  className={mode !== "off" ? styles.primary : ""}
                  onClick={() => setMode("off")}
                >
                  <Pause size={15} />
                  {es ? "Manual / Pausar" : "Manual / Pause"}
                </button>
                <button
                  disabled={!supported || game.winner !== null}
                  onClick={single}
                >
                  <SkipForward size={15} />
                  {es ? "Una acción automática" : "One automatic action"}
                </button>
                <button
                  disabled={!supported || game.winner !== null}
                  onClick={() => run("turn")}
                >
                  <Play size={15} />
                  {es ? "Automatizar este turno" : "Auto-play this turn"}
                </button>
                <select
                  aria-label={
                    es ? "Reproducción automática" : "Automatic playback"
                  }
                  value={mode}
                  disabled={!supported || game.winner !== null}
                  onChange={(e) => run(e.target.value as Mode)}
                >
                  <option value="off">
                    {es ? "Reproducción pausada" : "Playback paused"}
                  </option>
                  <option value="opponents">
                    {es ? "Solo jugadores ordenador" : "Computer players only"}
                  </option>
                  <option value="turn">
                    {es ? "Hasta terminar este turno" : "Until this turn ends"}
                  </option>
                  <option value="all">
                    {es ? "Toda la mesa · demo" : "Whole table · demo"}
                  </option>
                </select>
              </div>
              <small>
                {supported
                  ? es
                    ? "Puedes pausar entre acciones y tomar el control."
                    : "Pause between actions and take control."
                  : es
                    ? "Efectos o reglas del mazo sin verificar: juego automático desactivado."
                    : "Unverified deck rules or effects: automatic play is disabled."}
              </small>
            </div>
          )}
          {online.error && (
            <p className={styles.error} role="alert">
              {roomErrorText(online.error, es)}
            </p>
          )}
          <ol
            className={styles.phases}
            aria-label={es ? "Pasos del turno" : "Turn steps"}
          >
            {STEPS.map((step, i) => (
              <li
                key={step}
                aria-current={game.step === step ? "step" : undefined}
              >
                <span>{String(i + 1).padStart(2, "0")}</span>
                {STEP_LABELS[step][es ? 1 : 0]}
              </li>
            ))}
          </ol>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          {storageError && (
            <p className={styles.warning} role="status">
              {es
                ? "No se puede guardar en este dispositivo. Mantén esta pestaña abierta para conservar la partida."
                : "This device cannot save the game. Keep this tab open to preserve the session."}
            </p>
          )}
          <div className={styles.gameLayout}>
            <div className={styles.gameMain}>
              <section className={styles.decision} aria-live="polite">
                {(!online.id || canControl(act) || game.winner !== null) &&
                !online.busy ? (
                  <>
                    {" "}
                    <Decisions
                      key={`${game.turn}-${game.step}-${act}-${game.opening}-${game.commanderChoices[0]?.card ?? ""}`}
                      game={game}
                      es={es}
                      dispatch={(action) => {
                        setMode((previous) =>
                          previous === "opponents" ? previous : "off",
                        );
                        dispatch(action);
                      }}
                    />
                    <CardActions
                      key={`${selectedId}-${act}`}
                      g={game}
                      card={selected}
                      es={es}
                      dispatch={(action) => {
                        setMode((previous) =>
                          previous === "opponents" ? previous : "off",
                        );
                        dispatch(action);
                      }}
                    />
                  </>
                ) : (
                  <p>
                    {online.busy
                      ? es
                        ? "Enviando acción…"
                        : "Sending action…"
                      : `${es ? "Esperando a" : "Waiting for"} ${game.players[act].name}.`}
                  </p>
                )}
              </section>
              <div className={styles.board}>
                {game.players.map((p, i) => (
                  <section
                    className={`${styles.playerBoard} ${game.active === i ? styles.activeBoard : ""} ${p.lost ? styles.lost : ""}`}
                    key={i}
                    aria-label={`${p.name} ${es ? "campo de batalla" : "battlefield"}`}
                  >
                    <div className={styles.playerTop}>
                      <div>
                        <span className={styles.eyebrow}>
                          {p.computer ? <Bot size={13} /> : <Users size={13} />}
                          0{i + 1} ·{" "}
                          {p.lost
                            ? es
                              ? "ELIMINADO"
                              : "ELIMINATED"
                            : i === act
                              ? es
                                ? "DECIDE AHORA"
                                : "ACTING NOW"
                              : es
                                ? "EN MESA"
                                : "AT THE TABLE"}
                        </span>
                        <h2>{p.name}</h2>
                      </div>
                      <div className={styles.life}>
                        <strong>{p.life}</strong>
                        <small>
                          {es ? "vidas" : "life"}
                          {p.poison > 0
                            ? ` · ${p.poison} ${es ? "veneno" : "poison"}`
                            : ""}
                        </small>
                      </div>
                    </div>
                    <div className={styles.zoneCounts}>
                      {(
                        ["library", "hand", "graveyard", "exile"] as Zone[]
                      ).map((z) => (
                        <button
                          key={z}
                          onClick={() => {
                            setViewPlayer(i);
                            setZone(z);
                            setRevealed(false);
                          }}
                        >
                          {ZONE_LABELS[z][es ? 1 : 0]}{" "}
                          <b>{inZone(game, i, z).length}</b>
                        </button>
                      ))}
                    </div>
                    <div className={styles.commandZone}>
                      <span>
                        <Crown size={14} />
                        {es ? "Zona de mando" : "Command zone"}
                      </span>
                      <div className={styles.cardRow}>
                        {inZone(game, i, "command").map((c) => (
                          <CardTile
                            key={c.id}
                            {...{ g: game, c, es }}
                            selected={selectedId === c.id}
                            onClick={() => setSelectedId(c.id)}
                          />
                        ))}
                      </div>
                    </div>
                    <div className={styles.permanents}>
                      {inZone(game, i, "battlefield").length === 0 ? (
                        <p className={styles.emptyBoard}>
                          {es
                            ? "El campo está listo para tu primera carta."
                            : "The battlefield is waiting for your first card."}
                        </p>
                      ) : (
                        <>
                          {[true, false].map((isCreature) => (
                            <div
                              className={styles.cardRow}
                              key={String(isCreature)}
                            >
                              {inZone(game, i, "battlefield")
                                .filter((c) => creature(game, c) === isCreature)
                                .map((c) => (
                                  <CardTile
                                    key={c.id}
                                    {...{ g: game, c, es }}
                                    selected={selectedId === c.id}
                                    onClick={() => setSelectedId(c.id)}
                                  />
                                ))}
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                    <div className={styles.playerBottom}>
                      <span>
                        {es ? "Maná" : "Mana"}:{" "}
                        {Object.entries(p.mana)
                          .filter(([, v]) => v > 0)
                          .map(([k, v]) => `${k} ${v}`)
                          .join(" · ") || "—"}
                      </span>
                      {Object.keys(p.commanderDamage).length > 0 && (
                        <details>
                          <summary>
                            {es ? "Daño de comandante" : "Commander damage"}
                          </summary>
                          {Object.entries(p.commanderDamage).map(([id, n]) => (
                            <p key={id}>
                              {game.cards.find((c) => c.id === id)
                                ? definition(
                                    game,
                                    game.cards.find((c) => c.id === id)!,
                                  ).name
                                : id}
                              : {n}/21
                            </p>
                          ))}
                        </details>
                      )}
                      <button
                        disabled={!canControl(i)}
                        onClick={() => {
                          setViewPlayer(i);
                          setZone("hand");
                          setRevealed(true);
                        }}
                      >
                        {es ? "Ver mano" : "View hand"}
                      </button>
                    </div>
                  </section>
                ))}
              </div>
              <section className={styles.handPanel}>
                <div className={styles.toolbar}>
                  <h3>{ZONE_LABELS[zone][es ? 1 : 0]}</h3>
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
                  {["hand", "library"].includes(zone) &&
                    (!online.id ||
                      (zone === "hand" && canControl(viewPlayer))) && (
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
                </div>
                {["hand", "library"].includes(zone) &&
                (!revealed ||
                  (!!online.id &&
                    (zone === "library" || !canControl(viewPlayer)))) ? (
                  <p>
                    {inZone(game, viewPlayer, zone).length}{" "}
                    {es
                      ? "cartas ocultas. Esta es una mesa compartida: revela la zona solo cuando corresponda."
                      : "hidden cards. This is a shared table: reveal this zone only when appropriate."}
                  </p>
                ) : (
                  <div className={styles.handCards}>
                    {inZone(game, viewPlayer, zone).map((c) => (
                      <CardTile
                        key={c.id}
                        {...{ g: game, c, es }}
                        selected={selectedId === c.id}
                        onClick={() => setSelectedId(c.id)}
                      />
                    ))}
                  </div>
                )}
              </section>
              <section className={styles.stack}>
                <h3>
                  <Layers size={17} />
                  {es ? "Pila" : "Stack"}
                  <span>{game.stack.length}</span>
                </h3>
                {game.stack.length ? (
                  <ol>
                    {[...game.stack].reverse().map((s, i) => (
                      <li key={s.id}>
                        <button onClick={() => setSelectedId(s.card)}>
                          <b>{i === 0 ? (es ? "Siguiente" : "Next") : i + 1}</b>
                          {game.cards.find((c) => c.id === s.card)
                            ? definition(
                                game,
                                game.cards.find((c) => c.id === s.card)!,
                              ).name
                            : es
                              ? "Habilidad"
                              : "Ability"}
                          {s.ability
                            ? es
                              ? " · habilidad"
                              : " · ability"
                            : ""}
                          <small>
                            {game.players[s.controller].name}
                            {s.target
                              ? ` → ${"player" in s.target ? game.players[s.target.player]?.name : "card" in s.target ? game.cards.find((c) => c.id === (s.target as { card: string }).card)?.id : s.target.spell}`
                              : ""}
                          </small>
                        </button>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p>
                    {es
                      ? "La pila está vacía. Todos los jugadores deben pasar para avanzar al siguiente paso."
                      : "The stack is empty. Every player must pass to advance to the next step."}
                  </p>
                )}
              </section>
              {(!online.id || online.room?.host) && (
                <ManualTools
                  g={game}
                  selected={selected}
                  es={es}
                  dispatch={dispatch}
                  onManual={() => setMode("off")}
                />
              )}
              <details className={styles.log}>
                <summary>
                  {es ? "Registro de la partida" : "Game log"} ·{" "}
                  {game.log.length}
                </summary>
                <ol>
                  {[...game.log].reverse().map((entry, i) => (
                    <li key={i}>{es ? entry.es : entry.en}</li>
                  ))}
                </ol>
              </details>
              <details className={styles.concede}>
                <summary>
                  <Flag size={14} />
                  {es ? "Conceder partida" : "Concede game"}
                </summary>
                <p>
                  {es
                    ? "El jugador elegido abandona la partida. Puedes deshacer la acción."
                    : "The selected player leaves the game. You can undo this action."}
                </p>
                {game.players.map(
                  (p, i) =>
                    !p.lost &&
                    canControl(i) && (
                      <button
                        key={i}
                        onClick={() => {
                          setMode("off");
                          dispatch({ type: "concede", player: i });
                        }}
                      >
                        {p.name} · {es ? "concede" : "concede"}
                      </button>
                    ),
                )}
              </details>
            </div>
            <ReferencePanel card={selectedDef} es={es} />
          </div>
        </>
      )}
      <section className={styles.coverage}>
        <h2>{es ? "Qué puede hacer esta mesa" : "What this table can do"}</h2>
        <div>
          <article>
            <h3>{es ? "Commander, paso a paso" : "Commander, step by step"}</h3>
            <p>
              {es
                ? "40 vidas, 100 cartas, mulligan de Londres, impuesto de comandante, 21 daños de combate por comandante, prioridad multijugador, pila, combate y pasos del turno. Control manual, ordenador por asiento y deshacer."
                : "40 life, 100 cards, London mulligans, commander tax, 21 combat damage per commander, multiplayer priority, the stack, combat and turn steps. Manual control, computer seats and undo."}
            </p>
          </article>
          <article>
            <h3>
              {es
                ? "Automatización con alcance explícito"
                : "Automation with explicit coverage"}
            </h3>
            <p>
              {es
                ? "Los cuatro mazos de práctica admiten juego automático. Las cartas importadas fuera del conjunto probado necesitan efectos manuales. El sistema no interpreta cualquier texto Oracle como código ni sustituye a un juez."
                : "All four practice decks support automatic play. Imported cards outside the tested set need manual effects. The system does not turn arbitrary Oracle text into code or replace a judge."}
            </p>
            <details>
              <summary>
                {es ? "Ver cartas implementadas" : "See implemented cards"}
              </summary>
              <p>{STARTER_CARDS.map((c) => c.name).join(", ")}</p>
            </details>
          </article>
          <article>
            <h3>
              {es
                ? "Tus listas, en tu dispositivo"
                : "Your lists, on your device"}
            </h3>
            <p>
              {es
                ? "Las partidas locales y los mazos guardados se almacenan en este navegador. Consultar cartas envía sus nombres al servicio de referencia. Importar tu colección requiere iniciar sesión. Las salas online guardan el estado durante siete días y ocultan manos ajenas. No hay acciones de juego remoto por MCP."
                : "Local games and saved decks stay in this browser. Card lookups send card names to the reference service. Collection imports require sign-in. Online rooms store shared state for seven days and hide other players’ hands. Game actions are not exposed over MCP."}
            </p>
          </article>
        </div>
      </section>
      <footer className={styles.footer}>
        <Link href="/">
          <ArrowLeft size={14} />
          {es ? "Volver a Magic Brain" : "Back to Magic Brain"}
        </Link>
        <span>
          {es
            ? "Mesa de práctica no oficial. Magic: The Gathering es propiedad de Wizards of the Coast."
            : "Unofficial practice table. Magic: The Gathering is owned by Wizards of the Coast."}
        </span>
        <Link href="/developers">{es ? "Desarrolladores" : "Developers"}</Link>
      </footer>
    </main>
  );
}
function CardTile({
  g,
  c,
  es,
  selected,
  onClick,
}: {
  g: Game;
  c: Card;
  es: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  const d = definition(g, c);
  const combat = g.attacks.find((a) => a.card === c.id);
  const blocked = g.attacks.some((a) => a.blockers.includes(c.id));
  return (
    <button
      className={`${styles.cardTile} ${c.tapped ? styles.tapped : ""} ${selected ? styles.selected : ""}`}
      onClick={onClick}
      title={`${d.name} · ${c.id}`}
      aria-pressed={selected}
    >
      {d.imageUrl && /^https:\/\/cards\.scryfall\.io\//.test(d.imageUrl) && (
        <img src={d.imageUrl} alt="" loading="lazy" />
      )}
      <span>
        <strong>
          {c.commander && <Crown size={11} />} {d.name}
        </strong>
        <small>
          {d.manaCost}
          {creature(g, c)
            ? ` · ${stats(g, c).power}/${stats(g, c).toughness}`
            : ""}
        </small>
        <small>
          {c.tapped
            ? es
              ? "Girada"
              : "Tapped"
            : c.zone === "battlefield" && summoningSick(g, c)
              ? es
                ? "Mareo de invocación"
                : "Summoning sick"
              : ""}
          {c.damage ? ` · ${c.damage} ${es ? "daño" : "damage"}` : ""}
          {c.counters ? ` · ${c.counters} +1/+1` : ""}
          {combat
            ? ` → ${g.players[combat.defender].name}`
            : blocked
              ? es
                ? " · Bloqueando"
                : " · Blocking"
              : ""}
        </small>
      </span>
    </button>
  );
}
