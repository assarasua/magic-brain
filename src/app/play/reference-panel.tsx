"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { BookOpen, ExternalLink, Search } from "lucide-react";
import type { CardDefinition } from "@/lib/play/engine";
import {
  lookupCard,
  searchRulebook,
  type CardReference,
  type RuleResult,
} from "@/lib/play/references";
import { referenceErrorText } from "./deck-setup";
import styles from "./play.module.css";
export default function ReferencePanel({
  card,
  es,
}: {
  card?: CardDefinition;
  es: boolean;
}) {
  const [reference, setReference] = useState<CardReference | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("commander tax");
  const [rules, setRules] = useState<RuleResult | null>(null);
  const [ruleError, setRuleError] = useState("");
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      setReference(null);
      setError("");
      setLoading(false);
    }, 0);
    return () => clearTimeout(timer);
  }, [card?.id]);
  async function fetchRulings() {
    if (!card) return;
    setLoading(true);
    setError("");
    try {
      setReference((await lookupCard(card.name)).reference);
    } catch (e) {
      setError(referenceErrorText(e, es));
    } finally {
      setLoading(false);
    }
  }
  async function search() {
    setSearching(true);
    setRuleError("");
    try {
      setRules(await searchRulebook(query));
    } catch (e) {
      setRuleError(referenceErrorText(e, es));
    } finally {
      setSearching(false);
    }
  }
  const current = reference?.card.oracleId === card?.id ? reference : null;
  return (
    <aside className={styles.reference}>
      <span className={styles.eyebrow}>
        <BookOpen size={14} />
        {es ? "CARTAS Y REGLAS" : "CARDS & RULES"}
      </span>
      {card ? (
        <>
          <div className={styles.cardReference}>
            {card.imageUrl &&
              /^https:\/\/cards\.scryfall\.io\//.test(card.imageUrl) && (
                <img src={card.imageUrl} alt={card.name} loading="lazy" />
              )}
            <div>
              <h3>{card.name}</h3>
              <code>{card.manaCost}</code>
              <p>{card.typeLine}</p>
              <span
                className={
                  card.effect === "manual" ? styles.warning : styles.good
                }
              >
                {card.effect === "manual"
                  ? es
                    ? "Efectos manuales"
                    : "Manual effects"
                  : es
                    ? "Efectos automatizados"
                    : "Automated effects"}
              </span>
            </div>
          </div>
          <p className={styles.oracle}>
            {(current?.card.oracleText ?? card.oracleText) ||
              (es
                ? "Consulta la carta para obtener su texto Oracle."
                : "Look up this card to get its Oracle text.")}
          </p>
          {card.sourceUpdatedAt && (
            <small>Oracle · {card.sourceUpdatedAt.slice(0, 10)}</small>
          )}
          <button onClick={fetchRulings} disabled={loading}>
            {loading
              ? es
                ? "Consultando…"
                : "Looking up…"
              : es
                ? "Actualizar Oracle y ver rulings"
                : "Refresh Oracle & show rulings"}
          </button>
          {error && (
            <p role="alert" className={styles.warning}>
              {error}
            </p>
          )}
          {current && (
            <div className={styles.rulings}>
              {current.source?.oracle?.updatedAt && (
                <small>
                  Oracle · {current.source.oracle.updatedAt.slice(0, 10)}
                </small>
              )}
              {current.card.rulings?.length ? (
                current.card.rulings.map((r, i) => (
                  <article key={i}>
                    <small>
                      {r.publishedAt?.slice(0, 10)} · {r.source}
                    </small>
                    <p>{r.comment}</p>
                  </article>
                ))
              ) : (
                <p>
                  {es
                    ? "No se encontraron rulings publicados para esta carta. Consulta el texto Oracle y las reglas generales."
                    : "No published rulings were found for this card. Consult its Oracle text and the Comprehensive Rules."}
                </p>
              )}
              {current.card.rulingsTruncated && (
                <p>
                  {es
                    ? "Se muestra una selección. Consulta la fuente para ver todos los rulings."
                    : "Showing a selection. See the source for all rulings."}
                </p>
              )}
            </div>
          )}
          {card.sourceUrl && (
            <a href={card.sourceUrl} target="_blank" rel="noreferrer">
              {es ? "Fuente de la carta" : "Card source"}
              <ExternalLink size={13} />
            </a>
          )}
        </>
      ) : (
        <p>
          {es
            ? "Selecciona una carta de la mesa para consultar su texto y rulings."
            : "Select a card on the table to read its text and rulings."}
        </p>
      )}
      <div className={styles.ruleSearch}>
        <h3>{es ? "Consulta el reglamento" : "Look up a rule"}</h3>
        <p>
          {es
            ? "Busca en inglés o por número de regla. Los extractos oficiales son referencias; no se aplican automáticamente a la partida."
            : "Search in English or by rule number. Official excerpts are references; they are not automatically applied to the game."}
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void search();
          }}
        >
          <input
            aria-label={es ? "Buscar regla" : "Search rules"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            minLength={2}
            maxLength={300}
            required
          />
          <button aria-label={es ? "Buscar" : "Search"} disabled={searching}>
            <Search size={17} />
          </button>
        </form>
        {searching && (
          <p role="status">
            {es ? "Consultando reglas…" : "Looking up rules…"}
          </p>
        )}
        {ruleError && <p role="alert">{ruleError}</p>}
        {rules && (
          <div className={styles.rulings}>
            <small>
              {es ? "Edición del reglamento" : "Rules edition"}:{" "}
              {rules.source.effectiveDate}
            </small>
            {rules.results.length ? (
              rules.results.map((r, i) => (
                <article key={i}>
                  <a
                    href={r.citation.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {r.citation.ruleNumber ??
                      r.citation.glossaryTerm ??
                      r.citation.section}{" "}
                    · p. {r.citation.page}
                  </a>
                  <p>{r.excerpt}</p>
                </article>
              ))
            ) : (
              <p>
                {es
                  ? "Sin coincidencias. Prueba otro término."
                  : "No matches. Try another term."}
              </p>
            )}
            <small>{rules.source.freshnessNotice}</small>
          </div>
        )}
        <a
          href="https://magic.wizards.com/en/rules"
          target="_blank"
          rel="noreferrer"
        >
          {es ? "Reglas oficiales de Magic" : "Official Magic rules"}
          <ExternalLink size={13} />
        </a>
      </div>
    </aside>
  );
}
