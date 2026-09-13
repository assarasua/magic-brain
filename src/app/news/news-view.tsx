"use client";

import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  CalendarDays,
  CircleAlert,
  LoaderCircle,
  Newspaper,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useCardDetail } from "@/components/card-detail-provider";
import { LanguageToggle, useLanguage } from "@/components/language-provider";
import type {
  MarketBrief,
  MarketBriefSummary,
} from "@/lib/market-news";
import type { MarketBriefItem } from "@/lib/market-news-model";
import styles from "./news.module.css";

type ArchivePayload = {
  latestMarketDataDate: string | null;
  briefs: MarketBriefSummary[];
};

type LoadState<T> =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: T };

const formatDate = (date: string, locale: "en" | "es") =>
  new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en-GB", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));

const formatPrice = (value: number, locale: "en" | "es") =>
  new Intl.NumberFormat(locale === "es" ? "es-ES" : "en-GB", {
    style: "currency",
    currency: "EUR",
  }).format(value);

const formatPercent = (value: number | null) =>
  value === null ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;

function StateMessage({
  error,
  onRetry,
}: {
  error?: string;
  onRetry?: () => void;
}) {
  const { locale } = useLanguage();
  return (
    <div className={styles.state} role={error ? "alert" : "status"}>
      {error ? <CircleAlert size={22} /> : <LoaderCircle className="spin" size={22} />}
      <p>
        {error ??
          (locale === "es"
            ? "Preparando el último informe del mercado…"
            : "Preparing the latest market brief…")}
      </p>
      {onRetry && (
        <button type="button" onClick={onRetry}>
          <RefreshCw size={14} />
          {locale === "es" ? "Reintentar" : "Try again"}
        </button>
      )}
    </div>
  );
}

function NewsHeader({ detail }: { detail?: boolean }) {
  const { locale } = useLanguage();
  return (
    <header className={styles.header}>
      <div>
        {detail && (
          <Link href="/news" className={styles.back}>
            <ArrowLeft size={14} />
            {locale === "es" ? "Archivo" : "Archive"}
          </Link>
        )}
        <span className={styles.eyebrow}>
          <Newspaper size={13} />
          {locale === "es" ? "Noticias diarias del mercado" : "Daily market news"}
        </span>
        <h1>
          {detail
            ? locale === "es" ? "Informe diario" : "Daily brief"
            : locale === "es" ? "Archivo de mercado" : "Market archive"}
        </h1>
        <p>
          {locale === "es"
            ? "Análisis reproducible generado únicamente con precios almacenados."
            : "Reproducible analysis generated only from stored price data."}
        </p>
      </div>
      <LanguageToggle />
    </header>
  );
}

export function NewsArchive() {
  const { locale } = useLanguage();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<LoadState<ArchivePayload>>({
    status: "loading",
  });

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/news?limit=60", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(
          response.status === 401
            ? locale === "es" ? "Inicia sesión para consultar los informes." : "Sign in to read market briefs."
            : locale === "es" ? "No se pudo cargar el archivo." : "The archive could not be loaded.",
        );
        return response.json() as Promise<ArchivePayload>;
      })
      .then((data) => setState({ status: "ready", data }))
      .catch((error: Error) => {
        if (error.name !== "AbortError") {
          setState({ status: "error", message: error.message });
        }
      });
    return () => controller.abort();
  }, [attempt, locale]);

  return (
    <main className={styles.page}>
      <NewsHeader />
      {state.status === "loading" && <StateMessage />}
      {state.status === "error" && (
        <StateMessage
          error={state.message}
          onRetry={() => {
            setState({ status: "loading" });
            setAttempt((value) => value + 1);
          }}
        />
      )}
      {state.status === "ready" && state.data.briefs.length === 0 && (
        <div className={styles.state}>
          <CalendarDays size={22} />
          <p>
            {locale === "es"
              ? "Todavía no hay precios de mercado para publicar un informe."
              : "There is no market-price date available to publish yet."}
          </p>
        </div>
      )}
      {state.status === "ready" && state.data.briefs.length > 0 && (
        <section className={styles.archive} aria-label={locale === "es" ? "Informes publicados" : "Published briefs"}>
          {state.data.briefs.map((brief, index) => (
            <Link
              href={`/news/${brief.marketDataDate}`}
              className={styles.archiveCard}
              key={brief.id}
            >
              <div className={styles.archiveTop}>
                <span>{index === 0 ? (locale === "es" ? "Más reciente" : "Latest") : `v${brief.schemaVersion}`}</span>
                <ArrowRight size={17} />
              </div>
              <h2>{formatDate(brief.marketDataDate, locale)}</h2>
              <p>
                {locale === "es"
                  ? `${brief.coverage.sevenDayComparableCards.toLocaleString(locale)} cartas comparables en 7 días`
                  : `${brief.coverage.sevenDayComparableCards.toLocaleString(locale)} cards with 7-day comparisons`}
              </p>
              <div className={styles.archiveMetrics}>
                <span>
                  <TrendingUp size={13} />
                  {brief.categoryCounts.strongGrowth} {locale === "es" ? "crecimiento" : "growth"}
                </span>
                <span>
                  <BarChart3 size={13} />
                  {locale === "es" ? "Amplitud" : "Breadth"} {formatPercent(brief.breadth.score)}
                </span>
              </div>
            </Link>
          ))}
        </section>
      )}
    </main>
  );
}

function Category({
  title,
  description,
  items,
  tone,
}: {
  title: string;
  description: string;
  items: MarketBriefItem[];
  tone: "up" | "down" | "neutral";
}) {
  const { locale } = useLanguage();
  const { openCard } = useCardDetail();
  return (
    <section className={styles.category}>
      <div className={styles.categoryHead}>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <span>{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className={styles.emptyCategory}>
          {locale === "es"
            ? "Ninguna carta superó los umbrales de esta categoría."
            : "No cards crossed this category’s thresholds."}
        </p>
      ) : (
        <div className={styles.items}>
          {items.map((item) => (
            <button
              type="button"
              className={styles.item}
              key={`${item.cardId}-${title}`}
              onClick={() => openCard(item.cardId)}
              aria-label={`${locale === "es" ? "Abrir gráfico e histórico de" : "Open chart and history for"} ${item.name}`}
            >
              <div>
                <strong>{item.name}</strong>
                <span>{item.setCode.toUpperCase()} · {item.setName}</span>
                <span className={styles.chartHint}>
                  <BarChart3 size={11} />
                  {locale === "es" ? "Ver gráfico" : "View chart"}
                </span>
              </div>
              <strong>{formatPrice(item.currentPrice, locale)}</strong>
              <span className={tone === "up" ? styles.up : tone === "down" ? styles.down : ""}>
                7D {formatPercent(item.change7d)}
              </span>
              <span className={(item.change30d ?? 0) > 0 ? styles.up : (item.change30d ?? 0) < 0 ? styles.down : ""}>
                30D {formatPercent(item.change30d)}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

export function NewsDetail({ marketDataDate }: { marketDataDate: string }) {
  const { locale } = useLanguage();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<LoadState<MarketBrief>>({
    status: "loading",
  });

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/news/${encodeURIComponent(marketDataDate)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(
          response.status === 404
            ? locale === "es" ? "No existe un informe para esta fecha." : "No brief exists for this date."
            : locale === "es" ? "No se pudo cargar el informe." : "The brief could not be loaded.",
        );
        const payload = await response.json() as { brief: MarketBrief };
        return payload.brief;
      })
      .then((data) => setState({ status: "ready", data }))
      .catch((error: Error) => {
        if (error.name !== "AbortError") {
          setState({ status: "error", message: error.message });
        }
      });
    return () => controller.abort();
  }, [attempt, locale, marketDataDate]);

  const brief = state.status === "ready" ? state.data : null;

  return (
    <main className={styles.page}>
      <NewsHeader detail />
      {state.status === "loading" && <StateMessage />}
      {state.status === "error" && (
        <StateMessage
          error={state.message}
          onRetry={() => {
            setState({ status: "loading" });
            setAttempt((value) => value + 1);
          }}
        />
      )}
      {brief && (
        <>
          <section className={styles.lead}>
            <div>
              <span className={styles.eyebrow}>{formatDate(brief.marketDataDate, locale)}</span>
              <h2>{locale === "es" ? "El mercado, explicado por sus precios" : "The market, explained by its prices"}</h2>
              <p>
                {locale === "es"
                  ? "Este informe no contiene titulares externos: cada señal procede del histórico de precios de Magic Brain."
                  : "This brief contains no external headlines: every signal comes from Magic Brain’s stored price history."}
              </p>
            </div>
            <div className={styles.breadth}>
              <span>{locale === "es" ? "Amplitud 7D" : "7D breadth"}</span>
              <strong>{formatPercent(brief.content.breadth.score)}</strong>
              <small>
                {brief.content.breadth.advancers} {locale === "es" ? "suben" : "up"} ·{" "}
                {brief.content.breadth.decliners} {locale === "es" ? "bajan" : "down"}
              </small>
            </div>
          </section>

          <div className={styles.categoryGrid}>
            <Category
              title={locale === "es" ? "Crecimiento fuerte" : "Strong growth"}
              description={locale === "es" ? "Impulso positivo tanto a 7 como a 30 días." : "Positive momentum across both 7 and 30 days."}
              items={brief.content.categories.strongGrowth}
              tone="up"
            />
            <Category
              title={locale === "es" ? "Oportunidades de recuperación" : "Recovery opportunities"}
              description={locale === "es" ? "Rebote semanal tras seguir por debajo del nivel de 30 días." : "A weekly rebound while still below the 30-day level."}
              items={brief.content.categories.recoveryOpportunities}
              tone="up"
            />
            <Category
              title={locale === "es" ? "Impulso perdido" : "Lost momentum"}
              description={locale === "es" ? "Retroceso semanal pese a conservar una ganancia mensual." : "A weekly reversal despite retaining a monthly gain."}
              items={brief.content.categories.lostMomentum}
              tone="down"
            />
            <Category
              title={locale === "es" ? "Revaloración importante" : "Major repricing"}
              description={locale === "es" ? "Cambios absolutos de al menos 15% en 7D o 30% en 30D." : "Absolute moves of at least 15% over 7D or 30% over 30D."}
              items={brief.content.categories.majorRepricing}
              tone="neutral"
            />
          </div>

          <section className={styles.methodology}>
            <CircleAlert size={19} />
            <div>
              <h2>{locale === "es" ? "Metodología y frescura" : "Methodology and freshness"}</h2>
              <ul>
                <li>
                  {locale === "es"
                    ? `Datos más recientes: ${formatDate(brief.marketDataDate, locale)}; fuente almacenada: ${brief.source}.`
                    : `Newest data: ${formatDate(brief.marketDataDate, locale)}; stored source: ${brief.source}.`}
                </li>
                <li>
                  {locale === "es"
                    ? "Las comparaciones usan la fecha disponible más cercana anterior o igual a 7 y 30 días."
                    : "Comparisons use the nearest available date on or before 7 and 30 days."}
                </li>
                <li>
                  {locale === "es"
                    ? `${brief.content.coverage.sevenDayComparableCards.toLocaleString(locale)} de ${brief.content.coverage.currentCards.toLocaleString(locale)} impresiones no foil entre 2 € y 5.000 € tienen comparación 7D.`
                    : `${brief.content.coverage.sevenDayComparableCards.toLocaleString(locale)} of ${brief.content.coverage.currentCards.toLocaleString(locale)} non-foil printings priced €2–€5,000 have a 7D comparison.`}
                </li>
                <li>
                  {locale === "es"
                    ? "Las categorías son señales cuantitativas, no recomendaciones de compra ni noticias externas."
                    : "Categories are quantitative signals, not buy recommendations or external news."}
                </li>
              </ul>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
