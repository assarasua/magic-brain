"use client";

/* eslint-disable @next/next/no-img-element */

import {
  ArrowLeft,
  BarChart3,
  CircleAlert,
  Gauge,
  Info,
  SlidersHorizontal,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import styles from "./page.module.css";
import { AuthControl } from "@/components/auth-control";
import { MagicBrainLogo } from "@/components/brand-logo";
import { useCardDetail } from "@/components/card-detail-provider";
import { LanguageToggle, useLanguage } from "@/components/language-provider";
import { SetSelector } from "@/components/set-selector";
import { formatCurrency } from "@/lib/data";
import type {
  LatestSetWatchPick,
  LatestSetWatchResult,
} from "@/lib/latest-set-watch";

type SortKey = "score" | "momentum7d" | "momentum30d" | "price" | "risk";

const riskOrder = { low: 0, medium: 1, high: 2 };

const signedPercent = (value: number | null) =>
  value === null ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;

function ScoreBreakdown({ pick }: { pick: LatestSetWatchPick }) {
  const labels: Record<keyof typeof pick.score.components, string> = {
    momentum7d: "7D momentum",
    momentum30d: "30D momentum",
    stability: "Stability",
    drawdown: "Drawdown",
    history: "History",
    rarity: "Rarity",
    confidence: "Data confidence",
  };
  const maximums: Record<keyof typeof pick.score.components, number> = {
    momentum7d: 18,
    momentum30d: 22,
    stability: 20,
    drawdown: 15,
    history: 10,
    rarity: 5,
    confidence: 10,
  };

  return (
    <details
      className={styles.breakdown}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <summary>Why this score</summary>
      <div>
        {(Object.keys(pick.score.components) as Array<keyof typeof pick.score.components>).map((key) => (
          <span key={key}>
            <small>{labels[key]}</small>
            <strong>{pick.score.components[key].toFixed(1)} / {maximums[key]}</strong>
          </span>
        ))}
      </div>
    </details>
  );
}

export default function LatestSetWatchPage() {
  const { locale } = useLanguage();
  const { cardSurfaceProps } = useCardDetail();
  const [setCodes, setSetCodes] = useState<string[]>([]);
  const [result, setResult] = useState<LatestSetWatchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [sort, setSort] = useState<SortKey>("score");
  const [risk, setRisk] = useState("all");
  const [rarity, setRarity] = useState("all");
  const [minimumScore, setMinimumScore] = useState(0);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch(
      `/api/market/latest-set-watch${setCodes[0] ? `?set=${encodeURIComponent(setCodes[0])}` : ""}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error("Analysis unavailable");
        return response.json() as Promise<LatestSetWatchResult>;
      })
      .then(setResult)
      .catch((requestError: Error) => {
        if (requestError.name !== "AbortError") {
          setError(true);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [setCodes]);

  const picks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return [...(result?.picks ?? [])]
      .filter((pick) =>
        (risk === "all" || pick.score.risk === risk) &&
        (rarity === "all" || pick.card.rarity === rarity) &&
        pick.score.total >= minimumScore &&
        (!normalizedQuery || pick.card.name.toLowerCase().includes(normalizedQuery)))
      .sort((left, right) => {
        if (sort === "momentum7d") return (right.momentum7d ?? -Infinity) - (left.momentum7d ?? -Infinity);
        if (sort === "momentum30d") return (right.momentum30d ?? -Infinity) - (left.momentum30d ?? -Infinity);
        if (sort === "price") return (right.card.price ?? 0) - (left.card.price ?? 0);
        if (sort === "risk") return riskOrder[left.score.risk] - riskOrder[right.score.risk] || right.score.total - left.score.total;
        return right.score.total - left.score.total;
      });
  }, [minimumScore, query, rarity, result, risk, sort]);

  return (
    <main className={`account-page ${styles.page}`}>
      <header className="account-topbar">
        <Link href="/" className="inventory-brand"><MagicBrainLogo /></Link>
        <nav>
          <Link href="/market">Market pulse</Link>
          <Link href="/market/latest-set-watch" aria-current="page">Latest Set Watch</Link>
          <Link href="/inventory">Inventory</Link>
          <Link href="/watchlist">Watchlist</Link>
        </nav>
        <LanguageToggle />
        <AuthControl compact />
        <Link href="/market" className="back-dashboard"><ArrowLeft size={15} /> Market</Link>
      </header>

      <div className={styles.content}>
        <section className={styles.hero}>
          <div>
            <span className="eyebrow"><Sparkles size={13} /> {locale === "es" ? "Radar de edición" : "Set intelligence"}</span>
            <h1>{locale === "es" ? "Última edición en observación" : "Latest Set Watch"}</h1>
            <p>
              {locale === "es"
                ? "Una clasificación analítica y explicable de cartas de la expansión más reciente."
                : "An explainable analytical ranking of cards in the newest released tabletop expansion."}
            </p>
          </div>
          <SetSelector
            value={setCodes}
            onChange={(codes) => {
              setLoading(true);
              setError(false);
              setSetCodes(codes);
            }}
            label={locale === "es" ? "Cambiar edición" : "Change set"}
            allLabel={locale === "es" ? "Expansión más reciente" : "Latest expansion"}
          />
        </section>

        <aside className={styles.disclaimer}>
          <CircleAlert size={17} />
          <p>
            {locale === "es"
              ? "Clasificación informativa basada en precios históricos. No es asesoramiento financiero ni garantiza rentabilidad."
              : "Informational ranking based on historical prices. It is not financial advice and does not guarantee returns."}
          </p>
        </aside>

        <section className={styles.snapshot} aria-live="polite" aria-busy={loading}>
          <div>
            <span>{locale === "es" ? "Edición analizada" : "Analysed set"}</span>
            <strong>{result?.set?.name ?? (loading ? "Loading…" : "—")}</strong>
            <small>{result?.set ? `${result.set.code.toUpperCase()} · ${result.set.setType}` : "Newest eligible expansion"}</small>
          </div>
          <div>
            <span>{locale === "es" ? "Cartas puntuadas" : "Scored cards"}</span>
            <strong>{loading ? "—" : result?.picks.length ?? 0}</strong>
            <small>{result?.asOf ? `Prices through ${result.asOf}` : "No price date"}</small>
          </div>
          <div>
            <span>{locale === "es" ? "Mejor puntuación" : "Highest score"}</span>
            <strong>{loading ? "—" : result?.picks[0]?.score.total ?? "—"}<small>/100</small></strong>
            <small>Relative analytical rank</small>
          </div>
        </section>

        <details className={styles.methodology}>
          <summary><Info size={15} /> {locale === "es" ? "Cómo se calcula la puntuación" : "How the pick score works"}</summary>
          <p>{result?.methodology.summary ?? "Scores combine momentum, stability, drawdown, history, rarity, and confidence."}</p>
          <div>
            {result && Object.entries(result.methodology.weights).map(([label, weight]) => (
              <span key={label}><strong>{weight}</strong><small>{label.replace(/([A-Z0-9])/g, " $1").trim()}</small></span>
            ))}
          </div>
          <p><strong>Entry range:</strong> {result?.methodology.entryRange}</p>
        </details>

        <section className={styles.controls} aria-label="Recommendation filters">
          <div className={styles.controlTitle}><SlidersHorizontal size={15} /><strong>{locale === "es" ? "Filtrar y ordenar" : "Filter and sort"}</strong></div>
          <label>
            <span>{locale === "es" ? "Buscar carta" : "Search card"}</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Card name…" />
          </label>
          <label>
            <span>{locale === "es" ? "Riesgo" : "Risk"}</span>
            <select value={risk} onChange={(event) => setRisk(event.target.value)}>
              <option value="all">All</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
          <label>
            <span>{locale === "es" ? "Rareza" : "Rarity"}</span>
            <select value={rarity} onChange={(event) => setRarity(event.target.value)}>
              <option value="all">All</option>
              <option value="mythic">Mythic</option>
              <option value="rare">Rare</option>
              <option value="uncommon">Uncommon</option>
              <option value="common">Common</option>
            </select>
          </label>
          <label>
            <span>{locale === "es" ? "Puntuación mínima" : "Minimum score"} · {minimumScore}</span>
            <input type="range" min="0" max="90" step="5" value={minimumScore} onChange={(event) => setMinimumScore(Number(event.target.value))} />
          </label>
          <label>
            <span>{locale === "es" ? "Ordenar" : "Sort by"}</span>
            <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
              <option value="score">Pick score</option>
              <option value="momentum7d">7D momentum</option>
              <option value="momentum30d">30D momentum</option>
              <option value="risk">Lowest risk</option>
              <option value="price">Price</option>
            </select>
          </label>
        </section>

        {error && <div className={styles.empty}><CircleAlert size={20} /><p>{locale === "es" ? "No se pudo cargar el análisis de la edición." : "Unable to load this set analysis."}</p></div>}
        {!error && !loading && picks.length === 0 && (
          <div className={styles.empty}><BarChart3 size={20} /><p>No cards match these filters or have enough current price data.</p></div>
        )}

        <section className={`${styles.grid} ${loading ? styles.loading : ""}`} aria-label="Latest set picks">
          {loading && Array.from({ length: 6 }, (_, index) => <div className={styles.skeleton} key={index} />)}
          {!loading && picks.map((pick, index) => (
            <article className={`${styles.card} card-surface`} key={pick.card.id} {...cardSurfaceProps(pick.card)}>
              <div className={styles.cardVisual}>
                {pick.card.imageUrl ? <img src={pick.card.imageUrl} alt="" /> : <div className={styles.noImage}>No image</div>}
                <span className={styles.rank}>#{index + 1}</span>
                <div className={styles.score}><strong>{pick.score.total}</strong><span>pick score</span></div>
              </div>
              <div className={styles.cardBody}>
                <header>
                  <div>
                    <span>{pick.card.rarity} · {pick.card.setCode.toUpperCase()}</span>
                    <h2>{pick.card.name}</h2>
                  </div>
                  <strong>{pick.card.price === null ? "—" : formatCurrency(pick.card.price)}</strong>
                </header>
                <div className={styles.signals}>
                  <span className={(pick.momentum7d ?? 0) >= 0 ? styles.positive : styles.negative}>
                    {(pick.momentum7d ?? 0) >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                    <small>7D</small>{signedPercent(pick.momentum7d)}
                  </span>
                  <span className={(pick.momentum30d ?? 0) >= 0 ? styles.positive : styles.negative}>
                    <small>30D</small>{signedPercent(pick.momentum30d)}
                  </span>
                  <span><Gauge size={13} /><small>Risk</small>{pick.score.risk}</span>
                </div>
                <div className={styles.entry}>
                  <span>Observed entry range</span>
                  <strong>{pick.entryRange ? `${formatCurrency(pick.entryRange.low)}–${formatCurrency(pick.entryRange.high)}` : "Insufficient history"}</strong>
                </div>
                <ul>{pick.rationale.map((reason) => <li key={reason}>{reason}</li>)}</ul>
                <dl className={styles.rationale}>
                  <div><dt>Trend · {pick.score.trend}</dt><dd>{pick.trendRationale}</dd></div>
                  <div><dt>Risk · {pick.score.risk}</dt><dd>{pick.riskRationale}</dd></div>
                  <div><dt>Confidence · {pick.score.confidence}</dt><dd>{pick.confidenceRationale}</dd></div>
                </dl>
                <ScoreBreakdown pick={pick} />
                <small className={styles.openHint}>Select card for price history and actions</small>
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
