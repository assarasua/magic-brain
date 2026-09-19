"use client";
import { useState } from "react";
import Link from "next/link";
import { Bot, Copy, Users } from "lucide-react";
import { PRESETS } from "@/lib/play/decks";
import DeckSetup from "./deck-setup";
import type { OnlineRoomController } from "./use-online-room";
import { gameError } from "./game-controls";
import styles from "./play.module.css";
export function roomErrorText(code: string, es: boolean) {
  const messages: Record<string, [string, string]> = {
    signIn: [
      "Sign in to create or join an online room.",
      "Inicia sesión para crear o unirte a una sala online.",
    ],
    unavailable: [
      "Cannot reach the room service. Your last confirmed game state is preserved; reconnecting…",
      "No se puede contactar con la sala. Se conserva el último estado confirmado; reconectando…",
    ],
    roomMissing: [
      "This room does not exist or its seven-day invitation has expired.",
      "Esta sala no existe o su invitación de siete días ha caducado.",
    ],
    staleRoom: [
      "Another move arrived first. The table has refreshed; choose your action again.",
      "Llegó antes otra acción. La mesa se ha actualizado; elige de nuevo.",
    ],
    roomFull: ["All seats are occupied.", "Todos los asientos están ocupados."],
    notReady: [
      "Every human must join and save a deck before the host starts.",
      "Cada humano debe unirse y guardar un mazo antes de empezar.",
    ],
    manualAi: [
      "Computer opponents require supported decks in every seat. Use practice decks or replace computers with humans.",
      "Los ordenadores requieren mazos compatibles en todos los asientos. Usa mazos de práctica o sustituye los ordenadores por humanos.",
    ],
    invalidDeck: [
      "Check the deck's size, commanders, copies and color identity before saving.",
      "Comprueba tamaño, comandantes, copias e identidad de color antes de guardar.",
    ],
    roomLimit: [
      "You already host 12 active rooms. Rooms expire after seven days.",
      "Ya alojas 12 salas activas. Las salas caducan a los siete días.",
    ],
    notYourSeat: [
      "You can only act for your own seat.",
      "Solo puedes actuar por tu asiento.",
    ],
    hostOnly: [
      "Only the host can change this room setting.",
      "Solo el anfitrión puede cambiar este ajuste.",
    ],
    hostRuling: [
      "The host records shared manual rulings.",
      "El anfitrión registra las decisiones manuales compartidas.",
    ],
    occupiedSeat: [
      "This seat has already been taken. Refresh the room.",
      "Este asiento ya está ocupado. Actualiza la sala.",
    ],
    alreadyStarted: [
      "The game has already started. Decks and seats are locked.",
      "La partida ya ha empezado. Los mazos y asientos están bloqueados.",
    ],
    alreadyJoined: [
      "You are already seated in this room.",
      "Ya tienes asiento en esta sala.",
    ],
    notJoined: [
      "Join the room before taking an action.",
      "Únete a la sala antes de actuar.",
    ],
    hiddenCard: [
      "That card is in a private zone.",
      "Esa carta está en una zona privada.",
    ],
    invalidName: [
      "Enter a player name (1–60 characters).",
      "Introduce un nombre de jugador (1–60 caracteres).",
    ],
  };
  return messages[code]?.[es ? 1 : 0] ?? gameError(new Error(code), es);
}
export default function OnlineLobby({
  online,
  es,
}: {
  online: OnlineRoomController;
  es: boolean;
}) {
  const [name, setName] = useState("");
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const room = online.room;
  if (!room)
    return (
      <section className={styles.notice}>
        <h2>{es ? "Sala online" : "Online room"}</h2>
        <p>
          {online.error
            ? roomErrorText(online.error, es)
            : es
              ? "Cargando sala…"
              : "Loading room…"}
        </p>
        {online.error === "signIn" && (
          <Link
            className={styles.primary}
            href={`/login?callbackUrl=${encodeURIComponent(`/play?room=${online.id}`)}`}
          >
            {es ? "Entrar y volver a la sala" : "Sign in & return to the room"}
          </Link>
        )}
        <button onClick={online.exit}>{es ? "Volver" : "Back"}</button>
      </section>
    );
  return (
    <section className={styles.onlineLobby}>
      <div className={styles.setupTop}>
        <div>
          <span className={styles.eyebrow}>
            <Users size={15} />
            {es ? "SALA PRIVADA ONLINE" : "PRIVATE ONLINE ROOM"}
          </span>
          <h1>
            {es ? "Un asiento para cada rival." : "A seat for every opponent."}
          </h1>
          <p>
            {es
              ? "Invita a tus amigos o añade ordenadores. Cada humano elige su mazo y ve solo su mano. La partida se actualiza cada dos segundos."
              : "Invite friends or add computer opponents. Each human chooses a deck and sees only their own hand. The game updates every two seconds."}
          </p>
        </div>
        <button onClick={online.exit}>
          {es ? "Salir de la vista" : "Leave room view"}
        </button>
      </div>
      <div className={styles.invite}>
        <label>
          {es ? "Enlace de invitación" : "Invitation link"}
          <input
            readOnly
            value={`https://magicbrain.es/play?room=${room.id}`}
          />
        </label>
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(
                `${window.location.origin}/play?room=${room.id}`,
              );
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          <Copy size={15} />
          {copied
            ? es
              ? "Copiado"
              : "Copied"
            : es
              ? "Copiar enlace"
              : "Copy link"}
        </button>
      </div>
      <small>
        {es
          ? "Solo quienes tengan el enlace pueden unirse. Caduca"
          : "Anyone with the link can join. Expires"}
        : {room.expiresAt.slice(0, 10)} ·{" "}
        {es
          ? "Comparte el enlace solo con tu mesa."
          : "Share the link only with your table."}
      </small>
      {online.error && (
        <p className={styles.error} role="alert">
          {roomErrorText(online.error, es)}
        </p>
      )}
      <div className={styles.lobbySeats}>
        {room.seats.map((seat, i) => (
          <article key={i}>
            <span className={styles.eyebrow}>
              {seat.computer ? <Bot size={16} /> : <Users size={16} />}0{i + 1}
              {room.seat === i ? (es ? " · TÚ" : " · YOU") : ""}
            </span>
            <h3>
              {seat.occupied ? seat.name : es ? "Asiento libre" : "Open seat"}
            </h3>
            <p>
              {seat.ready
                ? seat.manual
                  ? es
                    ? "Mazo listo · efectos manuales"
                    : "Deck ready · manual effects"
                  : es
                    ? "Mazo listo"
                    : "Deck ready"
                : seat.occupied
                  ? es
                    ? "Eligiendo mazo…"
                    : "Choosing a deck…"
                  : es
                    ? "Esperando a un invitado"
                    : "Waiting for a guest"}
            </p>
            {room.host && !seat.occupied && (
              <select
                aria-label={`${es ? "Añadir ordenador al asiento" : "Add computer to seat"} ${i + 1}`}
                defaultValue=""
                disabled={online.busy}
                onChange={(e) => {
                  if (e.target.value)
                    void online.send({
                      type: "computer",
                      seat: i,
                      enabled: true,
                      preset: e.target.value,
                    });
                }}
              >
                <option value="">
                  {es ? "Añadir ordenador…" : "Add computer…"}
                </option>
                {PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name[es ? 1 : 0]}
                  </option>
                ))}
              </select>
            )}
            {room.host && seat.computer && (
              <button
                disabled={online.busy}
                onClick={() =>
                  online.send({ type: "computer", seat: i, enabled: false })
                }
              >
                {es ? "Abrir para un humano" : "Open for a human"}
              </button>
            )}
          </article>
        ))}
      </div>
      {!room.joined ? (
        <form
          className={styles.joinRoom}
          onSubmit={(e) => {
            e.preventDefault();
            void online.send({ type: "join", name });
          }}
        >
          <label>
            {es ? "Tu nombre en la mesa" : "Your table name"}
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              required
            />
          </label>
          <button
            className={styles.primary}
            disabled={
              online.busy || room.started || room.seats.every((s) => s.occupied)
            }
          >
            {room.started
              ? es
                ? "Partida ya empezada"
                : "Game already started"
              : es
                ? "Unirme a la mesa"
                : "Join the table"}
          </button>
        </form>
      ) : (
        <>
          <div className={styles.toolbar}>
            <button onClick={() => setEditing(!editing)}>
              {editing
                ? es
                  ? "Cerrar editor"
                  : "Close editor"
                : es
                  ? "Elegir / cambiar mi mazo"
                  : "Choose / change my deck"}
            </button>
            {room.host ? (
              <button
                className={styles.primary}
                disabled={online.busy || room.seats.some((s) => !s.ready)}
                onClick={() => online.send({ type: "start" })}
              >
                {es ? "Empezar partida online" : "Start online game"}
              </button>
            ) : (
              <>
                <span>
                  {es
                    ? "El anfitrión empieza cuando todos tienen su mazo listo."
                    : "The host starts when everyone's deck is ready."}
                </span>
                <button
                  disabled={online.busy}
                  onClick={() => online.send({ type: "leave" })}
                >
                  {es ? "Liberar mi asiento" : "Release my seat"}
                </button>
              </>
            )}
          </div>
          {(editing || !room.seats[room.seat].ready) && (
            <DeckSetup
              es={es}
              online
              initialInput={
                room.input ?? {
                  name: room.seats[room.seat].name,
                  commander: PRESETS[0].commander,
                  list: PRESETS[0].list,
                  computer: false,
                }
              }
              roomLabel={
                es ? "Guardar mi mazo en la sala" : "Save my deck to the room"
              }
              onStart={() => {}}
              onRoomCreate={async (input) => {
                await online.send({ type: "deck", input });
                setEditing(false);
              }}
              roomBusy={online.busy}
            />
          )}
        </>
      )}
    </section>
  );
}
