"use client";
import { useState } from "react";
import { ArrowRight, Hand, Shield, Swords } from "lucide-react";
import {
  COLORS,
  STEPS,
  actingPlayer,
  bottomCount,
  canAttack,
  canBlock,
  creature,
  definition,
  inZone,
  manaColor,
  payment,
  type Action,
  type Card,
  type Game,
  type Target,
  type Zone,
} from "@/lib/play/engine";
import styles from "./play.module.css";
import CardTile from "./card-tile";
export const STEP_LABELS = {
  untap: ["Untap", "Enderezar"],
  upkeep: ["Upkeep", "Mantenimiento"],
  draw: ["Draw", "Robar"],
  main1: ["Main 1", "Principal 1"],
  beginCombat: ["Begin combat", "Inicio combate"],
  attackers: ["Attackers", "Atacantes"],
  blockers: ["Blockers", "Bloqueadoras"],
  firstStrike: ["First strike", "Dañar primero"],
  damage: ["Damage", "Daño"],
  endCombat: ["End combat", "Fin combate"],
  main2: ["Main 2", "Principal 2"],
  end: ["End step", "Paso final"],
  cleanup: ["Cleanup", "Limpieza"],
};
export const ZONE_LABELS: Record<Zone, [string, string]> = {
  library: ["Library", "Biblioteca"],
  hand: ["Hand", "Mano"],
  battlefield: ["Battlefield", "Campo de batalla"],
  graveyard: ["Graveyard", "Cementerio"],
  exile: ["Exile", "Exilio"],
  command: ["Command zone", "Zona de mando"],
  stack: ["Stack", "Pila"],
};
export function gameError(error: unknown, es: boolean) {
  const code = error instanceof Error ? error.message : "invalid";
  const messages: Record<string, [string, string]> = {
    priority: [
      "Wait until this player has priority.",
      "Espera a que este jugador tenga prioridad.",
    ],
    mana: [
      "Not enough usable mana. Tap sources or enable automatic payment.",
      "No hay suficiente maná utilizable. Gira fuentes o activa el pago automático.",
    ],
    land: [
      "Play one land on your turn, in a main phase with an empty stack.",
      "Juega una tierra en tu turno, en una fase principal con la pila vacía.",
    ],
    timing: [
      "This spell needs your main phase and an empty stack.",
      "Este hechizo necesita tu fase principal y la pila vacía.",
    ],
    cast: [
      "Choose a spell from this player's hand or command zone.",
      "Elige un hechizo de la mano o zona de mando de este jugador.",
    ],
    commander: [
      "Resolve the pending command-zone choice first.",
      "Resuelve primero la elección de zona de mando.",
    ],
    target: [
      "Choose a legal target for this spell or ability.",
      "Elige un objetivo legal para este hechizo o habilidad.",
    ],
    declaration: [
      "Declare attackers or blockers before taking priority actions.",
      "Declara atacantes o bloqueadoras antes de las acciones con prioridad.",
    ],
    damage: [
      "Deal the pending combat damage first.",
      "Haz primero el daño de combate pendiente.",
    ],
    noPriority: [
      "This turn-based step has no priority window. Use Continue.",
      "Este paso no tiene ventana de prioridad. Usa Continuar.",
    ],
    opening: [
      "Choose an opening hand first.",
      "Elige primero una mano inicial.",
    ],
    bottom: [
      "Select exactly the required cards to put on the bottom.",
      "Selecciona exactamente las cartas requeridas para poner en el fondo.",
    ],
    discard: [
      "Select enough cards to discard down to seven.",
      "Selecciona las cartas necesarias para quedarte con siete.",
    ],
    attack: [
      "Check attackers, summoning sickness and defending players.",
      "Comprueba atacantes, mareo de invocación y jugadores defensores.",
    ],
    block: [
      "Check that each untapped blocker can block that attacker.",
      "Comprueba que cada bloqueadora enderezada puede bloquear a esa atacante.",
    ],
    menace: [
      "A creature with menace needs at least two blockers.",
      "Una criatura con amenaza necesita al menos dos bloqueadoras.",
    ],
    ability: [
      "The selected creatures cannot pay this ability's cost.",
      "Las criaturas elegidas no pueden pagar el coste de la habilidad.",
    ],
    note: [
      "Add a short explanation for the manual ruling.",
      "Añade una breve explicación de la decisión manual.",
    ],
    unsupported: [
      "This table contains effects that need manual resolution. Automatic play is paused.",
      "Esta mesa contiene efectos que necesitan resolución manual. El juego automático está pausado.",
    ],
    manual: [
      "Resolve the spell or ability manually before continuing.",
      "Resuelve el hechizo o habilidad manualmente antes de continuar.",
    ],
    tableLimit: [
      "The local table has reached its token limit. Pause and simplify the board manually.",
      "La mesa local ha alcanzado su límite de fichas. Pausa y simplifica el campo manualmente.",
    ],
    stack: [
      "Resolve the stack before making this change.",
      "Resuelve la pila antes de hacer este cambio.",
    ],
    over: [
      "The game has ended. Start a new table or undo the last action.",
      "La partida ha terminado. Empieza otra o deshaz la última acción.",
    ],
  };
  return (messages[code] ?? [
    "That action is not legal in the current state. Review the selected player, card and phase.",
    "Esa acción no es legal en el estado actual. Revisa jugador, carta y fase.",
  ])[es ? 1 : 0];
}
export function Decisions({
  game: g,
  es,
  dispatch,
  onInspect,
}: {
  game: Game;
  es: boolean;
  dispatch: (action: Action) => void;
  onInspect?: (id: string) => void;
}) {
  const player = actingPlayer(g);
  const p = g.players[player];
  const [marked, setMarked] = useState<string[]>([]);
  const [attacks, setAttacks] = useState<Record<string, string>>({});
  const [blocks, setBlocks] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const hand = inZone(g, player, "hand");
  const pickCards = (bottom: boolean) => (
    <>
      <p>
        {bottom
          ? es
            ? bottomCount(g, player)
              ? `Elige ${bottomCount(g, player)} cartas para poner en el fondo, en orden de selección.`
              : "Estas son tus siete cartas. Quédate la mano o vuelve a robar."
            : bottomCount(g, player)
              ? `Choose ${bottomCount(g, player)} cards for the bottom, in selection order.`
              : "These are your seven cards. Keep this hand or draw a new one."
          : es
            ? `Descarta ${Math.max(0, hand.length - 7)} cartas para quedarte con siete.`
            : `Discard ${Math.max(0, hand.length - 7)} cards to keep seven.`}
      </p>
      <div className={styles.handCards}>
        {hand.map((c) => (
          <CardTile
            key={c.id}
            g={g}
            c={c}
            es={es}
            selected={marked.includes(c.id)}
            onClick={() => {
              onInspect?.(c.id);
              if (bottom && !bottomCount(g, player)) return;
              setMarked((previous) =>
                previous.includes(c.id)
                  ? previous.filter((id) => id !== c.id)
                  : [...previous, c.id],
              );
            }}
          />
        ))}
      </div>
    </>
  );
  if (g.winner !== null)
    return (
      <p className={styles.win}>
        {g.winner === "draw"
          ? es
            ? "La partida termina en empate."
            : "The game is a draw."
          : `${g.players[g.winner].name} ${es ? "gana la partida." : "wins the game."}`}
      </p>
    );
  if (g.commanderChoices.length) {
    const choice = g.commanderChoices[0];
    const c = g.cards.find((c) => c.id === choice.card)!;
    return (
      <>
        <h3>
          {p.name} · {definition(g, c).name}
        </h3>
        <p>
          {es
            ? "¿Mover el comandante a la zona de mando?"
            : "Move the commander to the command zone?"}
        </p>
        <div className={styles.toolbar}>
          <button
            className={styles.primary}
            onClick={() =>
              dispatch({ type: "commander", player, card: c.id, command: true })
            }
          >
            {es ? "Zona de mando" : "Command zone"}
          </button>
          <button
            onClick={() =>
              dispatch({
                type: "commander",
                player,
                card: c.id,
                command: false,
              })
            }
          >
            {es ? "Mantener en" : "Keep in"}{" "}
            {ZONE_LABELS[choice.zone][es ? 1 : 0]}
          </button>
        </div>
      </>
    );
  }
  if (g.opening)
    return (
      <>
        <h3>
          <Hand size={18} />
          {p.name} · {es ? "Mano inicial" : "Opening hand"}
        </h3>
        {pickCards(true)}
        <div className={styles.toolbar}>
          <button
            onClick={() => dispatch({ type: "mulligan", player })}
            disabled={bottomCount(g, player) >= 7}
          >
            Mulligan{" "}
            {g.players.length > 2 && p.mulligans === 0
              ? es
                ? "gratis"
                : "free"
              : ""}
          </button>
          <button
            className={styles.primary}
            onClick={() =>
              dispatch({
                type: "keep",
                player,
                bottom: marked.filter((id) => hand.some((c) => c.id === id)),
              })
            }
          >
            {es ? "Quedarse la mano" : "Keep hand"}
            <ArrowRight size={15} />
          </button>
        </div>
      </>
    );
  if (g.manualResolution)
    return (
      <>
        <h3>
          {es ? "Resolución manual pendiente" : "Manual resolution pending"}
        </h3>
        <p>
          {es
            ? "Aplica los efectos con las herramientas manuales y explica la resolución. Después, el hechizo irá a su zona correspondiente."
            : "Apply the effects with the manual tools and explain the resolution. The spell will then move to its appropriate zone."}
        </p>
        <input
          value={note}
          maxLength={500}
          onChange={(e) => setNote(e.target.value)}
          placeholder={
            es ? "Qué ocurre al resolverse" : "What happens on resolution"
          }
        />
        <button
          disabled={note.trim().length < 3}
          onClick={() => dispatch({ type: "resolveManual", player, note })}
        >
          {es ? "Confirmar resolución" : "Confirm resolution"}
        </button>
      </>
    );
  if (g.declaration && g.step === "attackers")
    return (
      <>
        <h3>
          <Swords size={18} />
          {p.name} · {es ? "Declara atacantes" : "Declare attackers"}
        </h3>
        <p>
          {es
            ? "Elige a quién ataca cada criatura. Deja el selector vacío para no atacar."
            : "Choose whom each creature attacks. Leave it blank to hold it back."}
        </p>
        <div className={styles.picks}>
          {inZone(g, player, "battlefield")
            .filter((c) => canAttack(g, c))
            .map((c) => (
              <label key={c.id}>
                {definition(g, c).name}
                <select
                  value={attacks[c.id] ?? ""}
                  onChange={(e) =>
                    setAttacks({ ...attacks, [c.id]: e.target.value })
                  }
                >
                  <option value="">{es ? "No ataca" : "Not attacking"}</option>
                  {g.players.map(
                    (p, i) =>
                      i !== player &&
                      !p.lost && (
                        <option key={i} value={i}>
                          {p.name}
                        </option>
                      ),
                  )}
                </select>
              </label>
            ))}
        </div>
        <button
          className={styles.primary}
          onClick={() =>
            dispatch({
              type: "attack",
              player,
              attacks: Object.entries(attacks)
                .filter(([, defender]) => defender !== "")
                .map(([card, defender]) => ({
                  card,
                  defender: Number(defender),
                })),
            })
          }
        >
          {es ? "Confirmar atacantes" : "Confirm attackers"}
        </button>
      </>
    );
  if (g.declaration && g.step === "blockers")
    return (
      <>
        <h3>
          <Shield size={18} />
          {p.name} · {es ? "Declara bloqueadoras" : "Declare blockers"}
        </h3>
        <div className={styles.picks}>
          {inZone(g, player, "battlefield")
            .filter((c) => creature(g, c) && !c.tapped)
            .map((c) => (
              <label key={c.id}>
                {definition(g, c).name}
                <select
                  value={blocks[c.id] ?? ""}
                  onChange={(e) =>
                    setBlocks({ ...blocks, [c.id]: e.target.value })
                  }
                >
                  <option value="">{es ? "No bloquea" : "Not blocking"}</option>
                  {g.attacks
                    .filter((a) => a.defender === player)
                    .map((a) => g.cards.find((c) => c.id === a.card)!)
                    .filter((a) => canBlock(g, c, a))
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {definition(g, a).name} · {a.id}
                      </option>
                    ))}
                </select>
              </label>
            ))}
        </div>
        <button
          className={styles.primary}
          onClick={() =>
            dispatch({
              type: "block",
              player,
              blocks: Object.entries(blocks)
                .filter(([, attacker]) => attacker !== "")
                .map(([card, attacker]) => ({ card, attacker })),
            })
          }
        >
          {es ? "Confirmar bloqueadoras" : "Confirm blockers"}
        </button>
      </>
    );
  if (g.damagePending)
    return (
      <>
        <p>
          {es
            ? "Asignación automática: daño letal a cada bloqueadora en orden, después arrollar. Usa una decisión manual para otra asignación legal."
            : "Automatic assignment: lethal damage to each blocker in order, then trample. Use a manual ruling for another legal assignment."}
        </p>
        <button
          className={styles.primary}
          onClick={() => dispatch({ type: "damage", player })}
        >
          {es ? "Hacer daño de combate" : "Deal combat damage"}
        </button>
      </>
    );
  if (g.step === "cleanup" && hand.length > 7)
    return (
      <>
        {pickCards(false)}
        <button
          onClick={() =>
            dispatch({
              type: "discard",
              player,
              cards: marked.filter((id) => hand.some((c) => c.id === id)),
            })
          }
        >
          {es ? "Descartar selección" : "Discard selected"}
        </button>
      </>
    );
  return (
    <>
      <h3>
        {p.name} · {es ? "Tu siguiente acción" : "Your next action"}
      </h3>
      <p>
        {g.step === "untap"
          ? es
            ? "Endereza los permanentes y avanza al mantenimiento."
            : "Untap permanents and continue to upkeep."
          : g.step === "cleanup" && !g.cleanupPriority
            ? es
              ? "Retira el daño y los efectos temporales y termina el turno."
              : "Remove damage and temporary effects, then end the turn."
            : es
              ? "Selecciona una carta para jugarla o activar su habilidad. Cuando todos pasan con la pila vacía, avanza el paso."
              : "Select a card to play it or activate its ability. When everyone passes with an empty stack, the step advances."}
      </p>
      <button
        className={styles.primary}
        onClick={() => dispatch({ type: "pass", player })}
      >
        {g.step === "untap" || (g.step === "cleanup" && !g.cleanupPriority)
          ? es
            ? "Continuar"
            : "Continue"
          : es
            ? "Pasar prioridad"
            : "Pass priority"}
        <ArrowRight size={15} />
      </button>
      <small>
        {es ? "Pases consecutivos" : "Consecutive passes"}: {g.passes}/
        {g.players.filter((p) => !p.lost).length}
      </small>
    </>
  );
}
export function CardActions({
  g,
  card: c,
  es,
  dispatch,
}: {
  g: Game;
  card?: Card;
  es: boolean;
  dispatch: (action: Action) => void;
}) {
  const [target, setTarget] = useState("");
  const [autoPay, setAutoPay] = useState(true);
  const [advisors, setAdvisors] = useState<string[]>([]);
  if (
    !c ||
    g.opening ||
    g.declaration ||
    g.damagePending ||
    g.manualResolution ||
    g.commanderChoices.length ||
    g.winner !== null ||
    g.step === "untap" ||
    (g.step === "cleanup" && !g.cleanupPriority)
  )
    return null;
  const player = g.priority;
  const d = definition(g, c);
  const hand =
    (c.zone === "hand" || c.zone === "command") && c.owner === player;
  let chosen: Target | undefined;
  if (target.startsWith("player:"))
    chosen = { player: Number(target.slice(7)) };
  if (target.startsWith("card:")) chosen = { card: target.slice(5) };
  if (target.startsWith("spell:")) chosen = { spell: target.slice(6) };
  const targeted = [
    "bolt",
    "growth",
    "bounce",
    "counter",
    "petitioners",
  ].includes(d.effect);
  return (
    <div className={styles.cardActions}>
      <h4>{d.name}</h4>
      {targeted && (
        <label>
          {es ? "Objetivo" : "Target"}
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">
              {es ? "Elige objetivo…" : "Choose a target…"}
            </option>
            {["bolt", "petitioners"].includes(d.effect) &&
              g.players.map(
                (p, i) =>
                  !p.lost && (
                    <option key={i} value={`player:${i}`}>
                      {p.name}
                    </option>
                  ),
              )}
            {["bolt", "growth", "bounce"].includes(d.effect) &&
              g.cards
                .filter((c) => c.zone === "battlefield" && creature(g, c))
                .map((c) => (
                  <option key={c.id} value={`card:${c.id}`}>
                    {g.players[c.controller].name} · {definition(g, c).name} ·{" "}
                    {c.id}
                  </option>
                ))}
            {d.effect === "counter" &&
              g.stack
                .filter((x) => !x.ability)
                .map((x) => (
                  <option key={x.id} value={`spell:${x.id}`}>
                    {definition(g, g.cards.find((c) => c.id === x.card)!).name}
                  </option>
                ))}
          </select>
        </label>
      )}
      {hand && d.effect === "land" && (
        <button onClick={() => dispatch({ type: "land", player, card: c.id })}>
          {es ? "Jugar tierra" : "Play land"}
        </button>
      )}
      {hand && !d.typeLine.includes("Land") && (
        <>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={autoPay}
              onChange={(e) => setAutoPay(e.target.checked)}
            />
            {es
              ? "Girar fuentes para pagar automáticamente"
              : "Tap sources to pay automatically"}
          </label>
          <button
            disabled={!payment(g, player, c, autoPay)}
            onClick={() =>
              dispatch({
                type: "cast",
                player,
                card: c.id,
                autoPay,
                target: targeted ? chosen : undefined,
                manual: d.effect === "manual",
              })
            }
          >
            {es ? "Lanzar hechizo" : "Cast spell"}
            {c.commander && c.zone === "command" ? ` (+${c.casts * 2})` : ""}
          </button>
          {!payment(g, player, c, autoPay) && (
            <small>
              {es
                ? "Falta maná utilizable o el coste necesita pago manual."
                : "Needs more usable mana, or the cost requires manual payment."}
            </small>
          )}
        </>
      )}
      {c.zone === "battlefield" &&
        c.controller === player &&
        manaColor(g, c) && (
          <button
            disabled={c.tapped}
            onClick={() => dispatch({ type: "tapMana", player, card: c.id })}
          >
            {es ? "Girar para maná" : "Tap for mana"} · {manaColor(g, c)}
          </button>
        )}
      {c.zone === "battlefield" &&
        c.controller === player &&
        d.effect === "petitioners" && (
          <>
            <button
              disabled={!chosen || !("player" in chosen)}
              onClick={() =>
                chosen &&
                "player" in chosen &&
                dispatch({
                  type: "activate",
                  player,
                  card: c.id,
                  target: chosen.player,
                })
              }
            >
              {es ? "Pagar 1 y girar: moler 1" : "Pay 1 and tap: mill 1"}
            </button>
            <details>
              <summary>
                {es
                  ? "Girar cuatro Consejeros: moler 12"
                  : "Tap four Advisors: mill 12"}
              </summary>
              <div className={styles.picks}>
                {inZone(g, player, "battlefield")
                  .filter(
                    (c) =>
                      !c.tapped &&
                      definition(g, c).typeLine.includes("Advisor"),
                  )
                  .map((c) => (
                    <label key={c.id}>
                      <input
                        type="checkbox"
                        checked={advisors.includes(c.id)}
                        onChange={(e) =>
                          setAdvisors(
                            e.target.checked
                              ? [...advisors, c.id]
                              : advisors.filter((id) => id !== c.id),
                          )
                        }
                      />
                      {definition(g, c).name} · {c.id}
                    </label>
                  ))}
              </div>
              <button
                disabled={
                  advisors.length !== 4 || !chosen || !("player" in chosen)
                }
                onClick={() =>
                  chosen &&
                  "player" in chosen &&
                  dispatch({
                    type: "activate",
                    player,
                    card: c.id,
                    target: chosen.player,
                    group: advisors,
                  })
                }
              >
                {es ? "Activar" : "Activate"}
              </button>
            </details>
          </>
        )}
    </div>
  );
}
export function ManualTools({
  g,
  selected,
  es,
  dispatch,
  onManual,
}: {
  g: Game;
  selected?: Card;
  es: boolean;
  dispatch: (action: Action) => void;
  onManual: () => void;
}) {
  const [player, setPlayer] = useState(0);
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState("1");
  const [kind, setKind] = useState("life");
  const [zone, setZone] = useState<Zone>("battlefield");
  const [color, setColor] = useState<(typeof COLORS)[number]>("G");
  const [step, setStep] = useState(g.step);
  const [source, setSource] = useState("");
  const [tokenName, setTokenName] = useState("Creature");
  const [power, setPower] = useState("1");
  const [toughness, setToughness] = useState("1");
  const [keywords, setKeywords] = useState("");
  const value = Number(amount);
  const card = selected?.id;
  function apply() {
    const base = { type: "manual" as const, player, note };
    let action: Action = base;
    if (kind === "life")
      action = { ...base, life: g.players[player].life + value };
    if (kind === "poison")
      action = { ...base, poison: g.players[player].poison + value };
    if (kind === "draw") action = { ...base, draw: true };
    if (kind === "shuffle") action = { ...base, shuffle: true };
    if (kind === "mana") action = { ...base, mana: color };
    if (kind === "step") action = { ...base, step };
    if (kind === "zone") action = { ...base, card, zone };
    if (kind === "tap") action = { ...base, card, tap: !selected?.tapped };
    if (kind === "damage") action = { ...base, card, damage: value };
    if (kind === "counters") action = { ...base, card, counters: value };
    if (kind === "control") action = { ...base, card, controller: player };
    if (kind === "ability") action = { ...base, card, stackAbility: true };
    if (kind === "commander")
      action = { ...base, commanderDamage: { source, amount: value } };
    if (kind === "token")
      action = {
        ...base,
        token: {
          name: tokenName,
          power: Number(power),
          toughness: Number(toughness),
          keywords: keywords
            .split(",")
            .map((k) => k.trim())
            .filter(Boolean),
        },
      };
    onManual();
    dispatch(action);
  }
  const cardKinds = ["zone", "tap", "damage", "counters", "control", "ability"];
  return (
    <details className={styles.manual}>
      <summary>
        {es ? "Herramientas y decisiones manuales" : "Manual tools & rulings"}
      </summary>
      <p>
        {es
          ? "Para efectos sin implementación o decisiones acordadas en la mesa. Cada cambio queda en el registro y pausa la reproducción. Cambiar el paso no ejecuta sus acciones automáticas."
          : "For unimplemented effects or agreed table rulings. Every change is logged and pauses playback. Changing the step does not perform its automatic actions."}
      </p>
      <div className={styles.manualGrid}>
        <label>
          {es
            ? "Jugador afectado / controlador"
            : "Affected player / controller"}
          <select
            value={player}
            onChange={(e) => setPlayer(Number(e.target.value))}
          >
            {g.players.map((p, i) => (
              <option key={i} value={i} disabled={p.lost}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {es ? "Acción" : "Action"}
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            {[
              ["life", "Adjust life", "Ajustar vidas"],
              ["poison", "Adjust poison", "Ajustar veneno"],
              ["draw", "Draw one card", "Robar una carta"],
              ["shuffle", "Shuffle library", "Barajar biblioteca"],
              ["mana", "Add one mana", "Añadir un maná"],
              ["zone", "Move selected card", "Mover carta seleccionada"],
              ["tap", "Tap / untap selected card", "Girar / enderezar carta"],
              ["damage", "Set marked damage", "Fijar daño marcado"],
              ["counters", "Set +1/+1 counters", "Fijar contadores +1/+1"],
              ["control", "Change card controller", "Cambiar controlador"],
              [
                "ability",
                "Add manual ability to stack",
                "Añadir habilidad manual a la pila",
              ],
              [
                "commander",
                "Set commander combat damage",
                "Fijar daño de comandante",
              ],
              ["token", "Create a token", "Crear una ficha"],
              ["step", "Go to a step", "Ir a un paso"],
            ].map(([id, en, esText]) => (
              <option key={id} value={id}>
                {es ? esText : en}
              </option>
            ))}
          </select>
        </label>
        {["life", "poison", "damage", "counters", "commander"].includes(
          kind,
        ) && (
          <label>
            {["life", "poison"].includes(kind)
              ? es
                ? "Cambio (+/−)"
                : "Change (+/−)"
              : es
                ? "Total"
                : "Total"}
            <input
              type="number"
              min={-1000}
              max={1000}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
        )}
        {kind === "zone" && (
          <label>
            {es ? "Destino" : "Destination"}
            <select
              value={zone}
              onChange={(e) => setZone(e.target.value as Zone)}
            >
              {Object.entries(ZONE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label[es ? 1 : 0]}
                </option>
              ))}
            </select>
          </label>
        )}
        {kind === "mana" && (
          <label>
            {es ? "Maná" : "Mana"}
            <select
              value={color}
              onChange={(e) => setColor(e.target.value as typeof color)}
            >
              {COLORS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        )}
        {kind === "step" && (
          <label>
            {es ? "Paso" : "Step"}
            <select
              value={step}
              onChange={(e) => setStep(e.target.value as typeof step)}
            >
              {STEPS.map((s) => (
                <option key={s} value={s}>
                  {STEP_LABELS[s][es ? 1 : 0]}
                </option>
              ))}
            </select>
          </label>
        )}
        {kind === "commander" && (
          <label>
            {es ? "Comandante de origen" : "Source commander"}
            <select value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">{es ? "Elige…" : "Choose…"}</option>
              {g.cards
                .filter((c) => c.commander)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {g.players[c.owner].name} · {definition(g, c).name}
                  </option>
                ))}
            </select>
          </label>
        )}
        {kind === "token" && (
          <>
            <label>
              {es ? "Nombre de ficha" : "Token name"}
              <input
                value={tokenName}
                maxLength={80}
                onChange={(e) => setTokenName(e.target.value)}
              />
            </label>
            <label>
              {es ? "Fuerza" : "Power"}
              <input
                type="number"
                value={power}
                onChange={(e) => setPower(e.target.value)}
              />
            </label>
            <label>
              {es ? "Resistencia" : "Toughness"}
              <input
                type="number"
                value={toughness}
                onChange={(e) => setToughness(e.target.value)}
              />
            </label>
            <label>
              {es
                ? "Palabras clave en inglés, separadas por comas"
                : "English keywords, comma-separated"}
              <input
                value={keywords}
                maxLength={300}
                onChange={(e) => setKeywords(e.target.value)}
              />
            </label>
          </>
        )}
      </div>
      {cardKinds.includes(kind) && (
        <p>
          {es ? "Carta seleccionada" : "Selected card"}:{" "}
          {selected
            ? definition(g, selected).name
            : es
              ? "Selecciona una carta en la mesa."
              : "Select a card on the table."}
        </p>
      )}
      <label>
        {es ? "Explicación de la decisión" : "Ruling explanation"}
        <textarea
          value={note}
          maxLength={500}
          rows={2}
          onChange={(e) => setNote(e.target.value)}
          placeholder={
            es
              ? "Qué regla o efecto estás aplicando"
              : "Which rule or effect you are applying"
          }
        />
      </label>
      <button
        disabled={
          note.trim().length < 3 ||
          (cardKinds.includes(kind) && !card) ||
          g.players[player].lost ||
          (kind === "commander" && !source)
        }
        onClick={apply}
      >
        {es ? "Aplicar y registrar" : "Apply & log"}
      </button>
    </details>
  );
}
