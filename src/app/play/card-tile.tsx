"use client";
/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { Crown, Sparkles } from "lucide-react";
import {
  creature,
  definition,
  stats,
  summoningSick,
  type Card,
  type Game,
} from "@/lib/play/engine";
import styles from "./play.module.css";

export default function CardTile({
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
  const [failed, setFailed] = useState(false);
  const art =
    !failed &&
    d.imageUrl &&
    /^https:\/\/cards\.scryfall\.io\//.test(d.imageUrl);
  const combat = g.attacks.find((a) => a.card === c.id);
  const blocked = g.attacks.some((a) => a.blockers.includes(c.id));
  const pt = creature(g, c)
    ? `${stats(g, c).power}/${stats(g, c).toughness}`
    : "";
  const state = [
    c.tapped ? (es ? "Girada" : "Tapped") : "",
    c.zone === "battlefield" && summoningSick(g, c)
      ? es
        ? "Mareo de invocación"
        : "Summoning sick"
      : "",
    c.damage ? `${c.damage} ${es ? "daño" : "damage"}` : "",
    c.counters ? `${c.counters} +1/+1` : "",
    combat
      ? `→ ${g.players[combat.defender].name}`
      : blocked
        ? es
          ? "Bloqueando"
          : "Blocking"
        : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <button
      className={`${styles.cardTile} ${art ? styles.cardWithArt : styles.cardFallback} ${c.tapped ? styles.tapped : ""} ${selected ? styles.selected : ""} ${combat || blocked ? styles.inCombat : ""}`}
      onClick={onClick}
      title={[d.name, d.manaCost, pt, state].filter(Boolean).join(" · ")}
      aria-label={[d.name, d.manaCost, pt, state].filter(Boolean).join(" · ")}
      aria-pressed={selected}
      data-card-id={c.id}
    >
      {art ? (
        <img
          src={d.imageUrl}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className={styles.fallbackFace}>
          <strong>{d.name}</strong>
          <small>{d.manaCost}</small>
          <Sparkles aria-hidden="true" size={34} />
          <small>{d.typeLine}</small>
        </span>
      )}
      {c.commander && (
        <span className={styles.commanderBadge}>
          <Crown size={12} />
        </span>
      )}
      {pt && <span className={styles.powerBadge}>{pt}</span>}
      {!!(c.damage || c.counters || combat || blocked) && (
        <span className={styles.cardState}>
          {c.counters ? `+${c.counters} ` : ""}
          {c.damage ? `−${c.damage} ` : ""}
          {combat ? "⚔" : blocked ? "◆" : ""}
        </span>
      )}
      {c.tapped && (
        <span className={styles.tappedBadge}>{es ? "Girada" : "Tapped"}</span>
      )}
    </button>
  );
}
