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
import { PRESETS, STARTER_CARDS, buildDeck } from "@/lib/play/decks";
import {
  STEPS,
  actingPlayer,
  applyAction,
  automaticAction,
  createGame,
  definition,
  needsManual,
  restoreGame,
  type Action,
  type Deck,
  type Game,
  type Zone,
} from "@/lib/play/engine";
import DeckSetup from "./deck-setup";
import Battlefield from "./battlefield";
import OnlineLobby, { roomErrorText } from "./online-lobby";
import { useOnlineRoom } from "./use-online-room";
import ReferencePanel from "./reference-panel";
import {
  CardActions,
  Decisions,
  ManualTools,
  STEP_LABELS,
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
  const [playStyle, setPlayStyle] = useState<"ai" | "shared">("ai");
  const [controlAll, setControlAll] = useState(false);
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
    (!online.id && (controlAll || !game?.players[seat]?.computer)) ||
    (!!online.id && online.room?.seat === seat) ||
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
        if (action.type === "manual" || action.type === "resolveManual")
          setControlAll(true);
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
    const created = createGame(
      decks,
      crypto.getRandomValues(new Uint32Array(1))[0],
    );
    const home = Math.max(
      0,
      created.players.findIndex((p) => !p.computer),
    );
    setTable({
      game: created,
      manual,
    });
    setSelectedId(
      created.cards.find((c) => c.owner === home && c.commander)?.id ?? "",
    );
    setViewPlayer(home);
    setRevealed(decks.filter((d) => !d.computer).length === 1);
    setControlAll(manual);
    setMode(
      !manual && decks.some((deck) => deck.computer) ? "opponents" : "off",
    );
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
  const sharedSeat =
    !online.id &&
    game &&
    game.players.filter((p) => !p.computer).length > 1 &&
    !game.players[act].computer
      ? act
      : -1;
  useEffect(() => {
    if (sharedSeat < 0) return;
    const timer = setTimeout(() => {
      setViewPlayer(sharedSeat);
      setZone("hand");
      setRevealed(false);
      setSelectedId("");
    }, 0);
    return () => clearTimeout(timer);
  }, [sharedSeat]);
  const homeSeat =
    online.id && onlineSeat !== undefined && onlineSeat >= 0
      ? onlineSeat
      : sharedSeat >= 0
        ? sharedSeat
        : game
          ? Math.max(
              0,
              game.players.findIndex((p) => !p.computer),
            )
          : 0;
  const actingComputer =
    !!game?.players[act].computer && !controlAll && !online.id;
  const commanderArt = STARTER_CARDS.filter((c) =>
    ["Isamaru, Hound of Konda", "Jasmine Boreal", "Lady Orca"].includes(c.name),
  );
  return (
    <main className={`${styles.page} ${game ? styles.gamePage : ""}`}>
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
                <button
                  className={styles.primary}
                  onClick={() =>
                    start(
                      PRESETS.map(
                        (preset, i) =>
                          buildDeck({
                            name:
                              i === 0
                                ? es
                                  ? "Tú"
                                  : "You"
                                : `${es ? "IA" : "AI"} ${i}`,
                            computer: i > 0,
                            commander: preset.commander,
                            list: preset.list,
                          }).deck,
                      ),
                      false,
                    )
                  }
                >
                  <Play size={17} />
                  {es ? "Jugar ahora · contra 3 IA" : "Play now · vs 3 AI"}
                </button>
                <a href="#setup">
                  {es
                    ? "Tu mazo / otras formas de jugar"
                    : "Your deck / other ways to play"}
                  <ArrowRight size={17} />
                </a>
                {saved && (
                  <button
                    onClick={() => {
                      setTable(saved);
                      setSaved(null);
                      setControlAll(saved.manual);
                      setRevealed(
                        saved.game.players.filter((p) => !p.computer).length ===
                          1,
                      );
                      setMode(saved.manual ? "off" : "opponents");
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
                aria-pressed={!online.online && playStyle === "ai"}
                className={
                  !online.online && playStyle === "ai" ? styles.primary : ""
                }
                onClick={() => {
                  online.setOnline(false);
                  setPlayStyle("ai");
                }}
              >
                <Bot size={18} />
                {es ? "Jugar contra IA" : "Play vs AI"}
              </button>
              <button
                aria-pressed={!online.online && playStyle === "shared"}
                className={
                  !online.online && playStyle === "shared" ? styles.primary : ""
                }
                onClick={() => {
                  online.setOnline(false);
                  setPlayStyle("shared");
                }}
              >
                <Users size={18} />
                {es ? "Compartir dispositivo" : "Pass & play"}
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
              playStyle={playStyle}
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
                <span className={styles.controlSummary}>
                  <Users size={14} />
                  {controlAll
                    ? es
                      ? "Controlas toda la mesa"
                      : "You control the whole table"
                    : `${es ? "Tu asiento" : "Your seat"}: ${game.players[homeSeat].name}`}
                </span>
                {game.players.some((p) => p.computer) && !controlAll && (
                  <button
                    className={mode === "opponents" ? styles.primary : ""}
                    disabled={!supported || game.winner !== null}
                    onClick={() =>
                      mode === "opponents" ? setMode("off") : run("opponents")
                    }
                  >
                    {mode === "opponents" ? (
                      <Pause size={14} />
                    ) : (
                      <Play size={14} />
                    )}
                    {mode === "opponents"
                      ? es
                        ? "Pausar IA"
                        : "Pause AI"
                      : es
                        ? "Reanudar IA"
                        : "Resume AI"}
                  </button>
                )}
                <details className={styles.automationOptions}>
                  <summary>
                    {es ? "Control de la mesa" : "Table controls"}
                  </summary>
                  <div className={styles.toolbar}>
                    <button
                      onClick={() => {
                        setMode("off");
                        setControlAll(!controlAll);
                      }}
                    >
                      {controlAll
                        ? es
                          ? "Volver a mi asiento"
                          : "Return to my seat"
                        : es
                          ? "Controlar todos los asientos"
                          : "Control all seats"}
                    </button>
                    <button
                      disabled={!supported || game.winner !== null}
                      onClick={single}
                    >
                      <SkipForward size={14} />
                      {es ? "Una acción automática" : "One automatic action"}
                    </button>
                    <button
                      disabled={!supported || game.winner !== null}
                      onClick={() => run("turn")}
                    >
                      <Play size={14} />
                      {es ? "Automatizar este turno" : "Auto-play this turn"}
                    </button>
                    <select
                      aria-label={
                        es ? "Reproducción automática" : "Automatic playback"
                      }
                      value={mode}
                      disabled={!supported || game.winner !== null}
                      onChange={(e) => {
                        setControlAll(false);
                        run(e.target.value as Mode);
                      }}
                    >
                      <option value="off">
                        {es ? "Reproducción pausada" : "Playback paused"}
                      </option>
                      <option value="opponents">
                        {es
                          ? "Solo jugadores ordenador"
                          : "Computer players only"}
                      </option>
                      <option value="turn">
                        {es
                          ? "Hasta terminar este turno"
                          : "Until this turn ends"}
                      </option>
                      <option value="all">
                        {es ? "Toda la mesa · demo" : "Whole table · demo"}
                      </option>
                    </select>
                  </div>
                </details>
                {!supported && (
                  <small>
                    {es
                      ? "Efectos manuales · IA desactivada"
                      : "Manual effects · AI disabled"}
                  </small>
                )}
              </div>
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
              <Battlefield
                game={game}
                es={es}
                homeSeat={homeSeat}
                selectedId={selectedId}
                onSelect={setSelectedId}
                canControl={canControl}
                viewPlayer={viewPlayer}
                setViewPlayer={setViewPlayer}
                zone={zone}
                setZone={setZone}
                revealed={revealed}
                setRevealed={setRevealed}
                online={!!online.id}
                openingDecision={game.opening && canControl(act)}
              />
              <section
                className={`${styles.decision} ${game.opening ? styles.openingDecision : ""}`}
                aria-live="polite"
              >
                {(canControl(act) || game.winner !== null) && !online.busy ? (
                  <>
                    {" "}
                    <Decisions
                      key={`${game.turn}-${game.step}-${act}-${game.opening}-${game.commanderChoices[0]?.card ?? ""}`}
                      game={game}
                      es={es}
                      onInspect={setSelectedId}
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
                      : actingComputer
                        ? `${game.players[act].name} · ${mode === "off" ? (es ? "IA en pausa" : "AI paused") : es ? "La IA está jugando…" : "AI is playing…"}`
                        : `${es ? "Esperando a" : "Waiting for"} ${game.players[act].name}.`}
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
