"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  Download,
  LoaderCircle,
  Plus,
  Save,
  Upload,
  Users,
} from "lucide-react";
import Link from "next/link";
import {
  PRESETS,
  STARTER_CARDS,
  buildDeck,
  deckRows,
  type DeckInput,
  type DeckIssue,
} from "@/lib/play/decks";
import type { CardDefinition, Deck } from "@/lib/play/engine";
import {
  collectionDeck,
  collectionLists,
  resolveDefinition,
  ReferenceError,
} from "@/lib/play/references";
import styles from "./play.module.css";

type SavedDeck = { title: string; input: DeckInput };
const DECK_KEY = "magic-brain-play-decks-v1";
const initial = (): DeckInput[] =>
  PRESETS.map((p, i) => ({
    name: `Player ${i + 1}`,
    computer: i > 0,
    commander: p.commander,
    list: p.list,
  }));
export function issueText(issue: DeckIssue, es: boolean) {
  const messages: Record<string, [string, string]> = {
    tooLong: [
      "The list is too long (30,000 characters maximum).",
      "La lista es demasiado larga (máximo 30.000 caracteres).",
    ],
    line: ["Could not read this line", "No se pudo leer esta línea"],
    commanderCount: [
      "Choose one commander, or two with a legal pairing ability.",
      "Elige un comandante, o dos con una habilidad que permita la pareja.",
    ],
    deckSize: [
      "A Commander deck needs exactly 100 cards, including its commander(s).",
      "Un mazo Commander necesita exactamente 100 cartas, incluidos los comandantes.",
    ],
    notCommander: [
      "This card is not a recognized commander",
      "Esta carta no es un comandante reconocido",
    ],
    color: [
      "Outside the commander's color identity",
      "Fuera de la identidad de color del comandante",
    ],
    singleton: [
      "Too many copies for this card's deck-building rule",
      "Demasiadas copias según la regla de construcción de esta carta",
    ],
    unverified: [
      "Card details have not been verified",
      "Datos de la carta sin verificar",
    ],
    singletonUnknown: [
      "Check this card's duplicate exception manually",
      "Comprueba manualmente la excepción de copias de esta carta",
    ],
    partner: [
      "Confirm the commanders can legally be paired. Pairing abilities are manual.",
      "Confirma que los comandantes se pueden emparejar legalmente. Sus habilidades se gestionan manualmente.",
    ],
  };
  return `${(messages[issue.code] ?? [issue.code, issue.code])[es ? 1 : 0]}${issue.card ? `: ${issue.card}` : ""}`;
}
export function referenceErrorText(error: unknown, es: boolean) {
  const code = error instanceof ReferenceError ? error.code : "unavailable";
  return {
    signIn: [
      "Sign in to import your Magic Brain collection lists.",
      "Inicia sesión para importar tus listas de Magic Brain.",
    ],
    rateLimit: [
      "The lookup limit was reached. Wait before trying again; your list is preserved.",
      "Se alcanzó el límite de consultas. Espera antes de reintentar; tu lista se conserva.",
    ],
    notFound: [
      "No exact card match found. Check the English card name.",
      "No hay una coincidencia exacta. Comprueba el nombre de la carta en inglés.",
    ],
    ambiguous: [
      "Several cards match this name. Check the exact English name.",
      "Varias cartas coinciden. Comprueba el nombre exacto en inglés.",
    ],
    unavailable: [
      "The reference service is unavailable. Your local table still works; try again later.",
      "El servicio de consulta no está disponible. La mesa local sigue funcionando; reintenta más tarde.",
    ],
  }[code][es ? 1 : 0];
}
export default function DeckSetup({
  es,
  onStart,
  online = false,
  onRoomCreate,
  initialInput,
  roomLabel,
  roomBusy = false,
  playStyle = "ai",
}: {
  es: boolean;
  onStart: (decks: Deck[], manual: boolean) => void;
  online?: boolean;
  onRoomCreate?: (input: DeckInput, count: number) => void;
  initialInput?: DeckInput;
  roomLabel?: string;
  roomBusy?: boolean;
  playStyle?: "ai" | "shared";
}) {
  const [inputs, setInputs] = useState<DeckInput[]>(() => {
    const all = initial();
    if (initialInput) all[0] = initialInput;
    return all;
  });
  const [count, setCount] = useState(4);
  const [extra, setExtra] = useState<CardDefinition[]>([]);
  const [saved, setSaved] = useState<SavedDeck[]>([]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [accountLists, setAccountLists] = useState<
    { id: string; name: string }[]
  >([]);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => {
    if (online) return;
    const timer = setTimeout(
      () =>
        setInputs((all) =>
          all.map((input, i) => ({
            ...input,
            computer: playStyle === "ai" && i > 0,
          })),
        ),
      0,
    );
    return () => clearTimeout(timer);
  }, [playStyle, online]);
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const stored = JSON.parse(localStorage.getItem(DECK_KEY) ?? "[]");
        if (Array.isArray(stored))
          setSaved(
            stored
              .filter(
                (d) =>
                  typeof d.title === "string" &&
                  typeof d.input?.name === "string" &&
                  typeof d.input?.list === "string" &&
                  typeof d.input?.commander === "string" &&
                  d.input.list.length <= 30000,
              )
              .slice(0, 20),
          );
      } catch {
        /* A damaged optional deck library must not block setup. */
      }
    }, 0);
    return () => {
      clearTimeout(timer);
      abort.current?.abort();
    };
  }, []);
  const results = inputs
    .slice(0, count)
    .map((input) => buildDeck(input, extra));
  const update = (seat: number, patch: Partial<DeckInput>) =>
    setInputs((all) =>
      all.map((item, i) => (i === seat ? { ...item, ...patch } : item)),
    );
  const save = (title: string, input: DeckInput) => {
    const next = [
      ...saved.filter((d) => d.title !== title),
      { title, input },
    ].slice(-20);
    try {
      localStorage.setItem(DECK_KEY, JSON.stringify(next));
      setSaved(next);
      setNotice(
        es
          ? "Mazo guardado en este dispositivo."
          : "Deck saved on this device.",
      );
    } catch {
      setNotice(
        es
          ? "No se pudo guardar: almacenamiento lleno o desactivado."
          : "Could not save: storage is full or disabled.",
      );
    }
  };
  async function verify() {
    const controller = new AbortController();
    abort.current = controller;
    setNotice("");
    const names = [
      ...new Set(
        inputs
          .slice(0, count)
          .flatMap((input) => deckRows(input).rows.map((row) => row.name)),
      ),
    ].filter(
      (name) =>
        ![...STARTER_CARDS, ...extra].some(
          (c) => c.name.toLowerCase() === name.toLowerCase() && c.sourceUrl,
        ),
    );
    const failed: string[] = [];
    try {
      for (const [index, name] of names.entries()) {
        if (controller.signal.aborted) break;
        setBusy(`${index + 1}/${names.length} · ${name}`);
        try {
          const card = await resolveDefinition(name, controller.signal);
          setExtra((previous) => [
            ...previous.filter((c) => c.name !== card.name),
            card,
          ]);
        } catch (error) {
          if (controller.signal.aborted) break;
          failed.push(name);
          if (error instanceof ReferenceError && error.code === "rateLimit") {
            setNotice(referenceErrorText(error, es));
            return;
          }
        }
      }
      if (!controller.signal.aborted)
        setNotice(
          failed.length
            ? `${es ? "Sin verificar" : "Not verified"}: ${failed.join(", ")}`
            : es
              ? "Datos comprobados. Revisa los avisos antes de empezar."
              : "Card details checked. Review any notices before starting.",
        );
    } finally {
      setBusy("");
      abort.current = null;
    }
  }
  async function loadLists() {
    try {
      setAccountLists(await collectionLists());
      setNotice(
        es
          ? "Elige la lista en el asiento correspondiente."
          : "Choose a list in the relevant seat.",
      );
    } catch (e) {
      setNotice(referenceErrorText(e, es));
    }
  }
  const manual = results.some((r) => r.manual.length || r.warnings.length);
  return (
    <section
      className={styles.setup}
      aria-label={es ? "Preparar partida" : "Set up game"}
    >
      <div className={styles.setupTop}>
        <div>
          <span className={styles.eyebrow}>
            {es ? "01 / REÚNE A TU MESA" : "01 / GATHER YOUR TABLE"}
          </span>
          <h2>
            {es ? "Tu comandante. Tu lista." : "Your commander. Your list."}
          </h2>
          <p>
            {es
              ? "Pega un mazo o empieza con una lista de práctica. Cada jugador tiene su propio mazo de 100 cartas."
              : "Paste a deck or start with a practice list. Every player brings their own 100-card deck."}
          </p>
        </div>
        {!roomLabel && (
          <label className={styles.inlineLabel}>
            <Users size={18} />
            {es ? "Jugadores" : "Players"}
            <select
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              disabled={!!busy}
            >
              {[2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className={styles.toolbar}>
        <button onClick={loadLists}>
          <Download size={16} />
          {es
            ? "Cargar mis listas de Magic Brain"
            : "Load my Magic Brain lists"}
        </button>
        <Link href="/login?callbackUrl=%2Fplay">
          {es ? "Entrar para importar" : "Sign in to import"}
        </Link>
        <span>
          {es
            ? "Importar no modifica tu colección."
            : "Importing does not change your collection."}
        </span>
      </div>
      <div className={`${styles.deckGrid} ${online ? styles.singleDeck : ""}`}>
        {inputs.slice(0, online ? 1 : count).map((input, seat) => (
          <DeckEditor
            key={seat}
            {...{ es, input, seat, saved, accountLists }}
            result={results[seat]}
            disabled={!!busy}
            onChange={(patch) => update(seat, patch)}
            onSave={(title) => save(title, input)}
            onImport={async (id) => {
              try {
                update(seat, { list: await collectionDeck(id) });
              } catch (e) {
                setNotice(referenceErrorText(e, es));
              }
            }}
          />
        ))}
      </div>
      <div className={styles.startPanel}>
        <div>
          <h3>
            {online
              ? es
                ? "Tu mazo para la sala"
                : "Your deck for the room"
              : manual
                ? es
                  ? "Mesa con resolución manual"
                  : "Table with manual resolution"
                : es
                  ? "Lista para jugar"
                  : "Ready to play"}
          </h3>
          <p>
            {es
              ? "Se comprueban el tamaño, las copias y la identidad de color. La lista de prohibidas y las excepciones especiales necesitan revisión. Los mazos de práctica usan cartas que permiten cualquier número de copias."
              : "Size, copy limits and color identity are checked. Banned cards and special exceptions need review. Practice decks use cards that explicitly allow any number of copies."}
          </p>
          <p>
            {online
              ? manual
                ? es
                  ? "Este mazo necesita resolución manual. Usa solo asientos humanos."
                  : "This deck needs manual resolution. Use human seats only."
                : es
                  ? "Este mazo puede jugar contra ordenadores o humanos."
                  : "This deck can play against computers or humans."
              : manual
                ? es
                  ? "La reproducción automática estará desactivada. Podrás jugar cada fase y resolver las habilidades con las herramientas manuales."
                  : "Automatic play will be disabled. You can control every phase and resolve abilities with the manual tools."
                : es
                  ? "Estos mazos admiten juego automático. Son listas sencillas para practicar, no recomendaciones competitivas."
                  : "These decks support automatic play. They are simple practice lists, not competitive recommendations."}
          </p>
        </div>
        <div className={styles.startActions}>
          <button onClick={verify} disabled={!!busy}>
            {busy ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <Check size={16} />
            )}
            {es ? "Comprobar cartas" : "Check card details"}
          </button>
          {busy && (
            <button onClick={() => abort.current?.abort()}>
              {es ? "Cancelar consulta" : "Cancel lookup"}
            </button>
          )}
          <button
            className={styles.primary}
            disabled={
              !!busy ||
              roomBusy ||
              results.some((r) => r.issues.length) ||
              inputs.slice(0, online ? 1 : count).some((i) => !i.name.trim())
            }
            onClick={() =>
              online
                ? onRoomCreate?.(inputs[0], count)
                : onStart(
                    results.map((r) => r.deck),
                    manual,
                  )
            }
          >
            {online
              ? (roomLabel ?? (es ? "Crear sala online" : "Create online room"))
              : manual
                ? es
                  ? "Abrir mesa manual"
                  : "Open manual table"
                : es
                  ? "Empezar partida"
                  : "Start game"}
            <ArrowRight size={18} />
          </button>
        </div>
      </div>
      {(busy || notice) && (
        <p className={styles.notice} role="status">
          {busy || notice}
        </p>
      )}
    </section>
  );
}
function DeckEditor({
  es,
  input,
  seat,
  saved,
  accountLists,
  result,
  disabled,
  onChange,
  onSave,
  onImport,
}: {
  es: boolean;
  input: DeckInput;
  seat: number;
  saved: SavedDeck[];
  accountLists: { id: string; name: string }[];
  result: ReturnType<typeof buildDeck>;
  disabled: boolean;
  onChange: (patch: Partial<DeckInput>) => void;
  onSave: (title: string) => void;
  onImport: (id: string) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [fileError, setFileError] = useState("");
  return (
    <article className={styles.deckCard}>
      <div className={styles.seatHeading}>
        <span className={styles.seatNumber}>0{seat + 1}</span>
        <label>
          {es ? "Jugador" : "Player"}
          <input
            aria-label={`${es ? "Nombre jugador" : "Player name"} ${seat + 1}`}
            maxLength={60}
            value={input.name}
            onChange={(e) => onChange({ name: e.target.value })}
            disabled={disabled}
          />
        </label>
        <label>
          {es ? "Control" : "Control"}
          <select
            aria-label={`${es ? "Control del jugador" : "Player control"} ${seat + 1}`}
            value={input.computer ? "computer" : "human"}
            onChange={(e) =>
              onChange({ computer: e.target.value === "computer" })
            }
          >
            <option value="human">{es ? "Humano" : "Human"}</option>
            <option value="computer">{es ? "IA" : "AI"}</option>
          </select>
        </label>
      </div>
      <label>
        {es ? "Cargar mazo" : "Load deck"}
        <select
          disabled={disabled}
          aria-label={es ? "Cargar mazo" : "Load deck"}
          defaultValue=""
          onChange={(e) => {
            const [kind, id] = e.target.value.split(":");
            if (kind === "preset") {
              const p = PRESETS[Number(id)];
              onChange({ commander: p.commander, list: p.list });
            }
            if (kind === "saved") {
              const d = saved[Number(id)].input;
              onChange({ commander: d.commander, list: d.list });
            }
            if (kind === "collection") void onImport(id);
            e.target.value = "";
          }}
        >
          <option value="">
            {es ? "Elegir una lista…" : "Choose a list…"}
          </option>
          <optgroup label={es ? "Práctica automática" : "Automatic practice"}>
            {PRESETS.map((p, i) => (
              <option key={p.id} value={`preset:${i}`}>
                {p.name[es ? 1 : 0]}
              </option>
            ))}
          </optgroup>
          {saved.length > 0 && (
            <optgroup
              label={
                es ? "Guardados en este dispositivo" : "Saved on this device"
              }
            >
              {saved.map((d, i) => (
                <option key={d.title} value={`saved:${i}`}>
                  {d.title}
                </option>
              ))}
            </optgroup>
          )}
          {accountLists.length > 0 && (
            <optgroup label="Magic Brain">
              {accountLists.map((d) => (
                <option key={d.id} value={`collection:${d.id}`}>
                  {d.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>
      <label>
        {es ? "Comandante(s), uno por línea" : "Commander(s), one per line"}
        <textarea
          aria-label={
            es ? "Comandante(s), uno por línea" : "Commander(s), one per line"
          }
          rows={2}
          value={input.commander}
          onChange={(e) => onChange({ commander: e.target.value })}
          maxLength={500}
          disabled={disabled}
          placeholder="1 Isamaru, Hound of Konda"
        />
      </label>
      <label>
        {es
          ? "Lista del mazo · cantidad y nombre en inglés"
          : "Deck list · quantity and English card name"}
        <textarea
          aria-label={
            es
              ? "Lista del mazo · cantidad y nombre en inglés"
              : "Deck list · quantity and English card name"
          }
          className={styles.deckText}
          rows={6}
          value={input.list}
          onChange={(e) => onChange({ list: e.target.value })}
          maxLength={30000}
          disabled={disabled}
          spellCheck={false}
          placeholder={"40 Plains\n59 Hare Apparent"}
        />
      </label>
      <div className={styles.deckTools}>
        <span className={result.count === 100 ? styles.good : styles.warning}>
          {result.count}/100 {es ? "cartas" : "cards"}
        </span>
        <label className={styles.fileButton}>
          <Upload size={14} />
          {es ? "Importar .txt" : "Import .txt"}
          <input
            type="file"
            accept=".txt,.dec,text/plain"
            disabled={disabled}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 30000) {
                setFileError(es ? "Máximo 30 KB." : "30 KB maximum.");
                return;
              }
              try {
                onChange({ list: await file.text() });
                setFileError("");
              } catch {
                setFileError(
                  es
                    ? "No se pudo leer el archivo."
                    : "Could not read the file.",
                );
              }
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <div className={styles.saveDeck}>
        <input
          aria-label={`${es ? "Nombre del mazo guardado" : "Saved deck name"} ${seat + 1}`}
          placeholder={es ? "Nombre para guardar" : "Name this deck"}
          value={title}
          maxLength={60}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button
          aria-label={es ? "Guardar mazo" : "Save deck"}
          disabled={!title.trim()}
          onClick={() => onSave(title.trim())}
        >
          <Save size={16} />
        </button>
      </div>
      {fileError && <p role="alert">{fileError}</p>}
      {result.issues.length > 0 && (
        <ul className={styles.warning}>
          {result.issues.slice(0, 5).map((issue, i) => (
            <li key={i}>{issueText(issue, es)}</li>
          ))}
        </ul>
      )}
      {result.warnings.length > 0 && (
        <details>
          <summary>
            {result.warnings.length}{" "}
            {es ? "avisos que revisar" : "notices to review"}
          </summary>
          <ul>
            {result.warnings.map((issue, i) => (
              <li key={i}>{issueText(issue, es)}</li>
            ))}
          </ul>
        </details>
      )}
      <details>
        <summary>
          {result.manual.length ? <Plus size={13} /> : <Check size={13} />}
          {result.manual.length
            ? `${result.manual.length} ${es ? "cartas distintas con efectos manuales" : "unique cards with manual effects"}`
            : es
              ? "Efectos compatibles con juego automático"
              : "Effects supported for automatic play"}
        </summary>
        <p>
          {result.manual.length
            ? result.manual.join(", ")
            : es
              ? "Solo las cartas del conjunto de práctica tienen implementaciones automáticas comprobadas."
              : "Only cards in the practice set have tested automatic implementations."}
        </p>
      </details>
    </article>
  );
}
