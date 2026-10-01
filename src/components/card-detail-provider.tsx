"use client";

/* eslint-disable @next/next/no-img-element */

import {
  Activity,
  BarChart3,
  ExternalLink,
  Plus,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import Link from "next/link";
import {
  createContext,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { CatalogCard } from "@/lib/catalog";
import { formatCurrency } from "@/lib/data";
import {
  calculateSeriesMetrics,
  movingAverage,
} from "@/lib/financial-analytics";
import { useLanguage } from "@/components/language-provider";
import type { PriceHistoryPoint, PriceInterval } from "@/lib/price-history-core";

type CardDetailContextValue = {
  openCard: (card: CatalogCard | string) => void;
  cardSurfaceProps: (card: CatalogCard | string) => {
    role: "group";
    tabIndex: number;
    onClick: (event: MouseEvent<HTMLElement>) => void;
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
    "aria-label": string;
  };
};

const CardDetailContext = createContext<CardDetailContextValue | null>(null);

export function PriceHistoryChart({
  history,
  locale,
  interval,
}: {
  history: PriceHistoryPoint[];
  locale: "en" | "es";
  interval: PriceInterval;
}) {
  const [asOf] = useState(() => new Date().toISOString().slice(0, 10));
  const [view, setView] = useState<"price" | "return">("price");
  const [showAverage, setShowAverage] = useState(true);
  const [hovered, setHovered] = useState<number | null>(null);
  const values = history.filter((point) => point.eur !== null) as Array<
    PriceHistoryPoint & { eur: number }
  >;
  if (values.length === 0) {
    return <div className="history-empty">{locale === "es" ? "No hay precios disponibles para este periodo." : "No prices available for this period."}</div>;
  }
  const monthly = interval === "monthly";
  const metrics = values.every((point) => point.eur > 0) ? calculateSeriesMetrics(
    values.map((point) => ({ date: point.date, value: point.eur })),
  ) : null;
  const average = movingAverage(
    values.map((point) => ({ date: point.date, value: point.eur })),
    Math.min(30, Math.max(7, Math.round(values.length / 6))),
  );
  const start = values[0].eur;
  const plotReturn = view === "return" && start > 0;
  const plotted = values.map((point) =>
    plotReturn ? ((point.eur - start) / start) * 100 : point.eur,
  );
  const averagePlotted = average.map((point) =>
    plotReturn ? ((point.value - start) / start) * 100 : point.value,
  );
  const width = 720;
  const height = 230;
  const min = Math.min(...plotted);
  const max = Math.max(...plotted);
  const y = (value: number) => max === min ? height / 2 :
    height - ((value - min) / Math.max(max - min, 0.01)) * (height - 20) - 10;
  const datePosition = (date: string) => monthly
    ? Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7))
    : Date.parse(`${date}T00:00:00Z`);
  const windowEnd = monthly ? values.at(-1)!.date : asOf;
  const windowStart = monthly ? values[0].date
    : new Date(Date.parse(`${asOf}T00:00:00Z`) - 29 * 86_400_000).toISOString().slice(0, 10);
  const firstPosition = datePosition(windowStart);
  const positionRange = datePosition(windowEnd) - firstPosition;
  const x = (index: number) => positionRange === 0
    ? width / 2
    : ((datePosition(values[index].date) - firstPosition) / positionRange) * width;
  const points = plotted
    .map((point, index) => `${x(index)},${y(point)}`)
    .join(" ");
  const averagePoints = averagePlotted
    .map((point, index) => `${x(index)},${y(point)}`)
    .join(" ");
  const activeIndex = Math.min(hovered ?? values.length - 1, values.length - 1);
  const active = values[activeIndex];
  const activeValue = plotted[activeIndex];
  const activeX = x(activeIndex);
  const activeY = y(activeValue);
  const positive = (metrics?.returnPercent ?? 0) >= 0;
  const formatAxis = (value: number) =>
    plotReturn ? `${value >= 0 ? "+" : ""}${value.toFixed(1)}%` : formatCurrency(value);
  const formatDate = (date: string) => new Intl.DateTimeFormat(locale, {
    ...(monthly ? {} : { day: "numeric" as const }),
    month: "short", year: "numeric", timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));

  return (
    <div className="investment-history">
      <div className="investment-chart-toolbar">
        <div>
          <strong>{formatCurrency(active.eur)}</strong>
          <span className={positive ? "up" : "down"}>
            {positive ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
            {metrics ? `${metrics.returnPercent >= 0 ? "+" : ""}${metrics.returnPercent.toFixed(2)}%` : "—"}
          </span>
        </div>
        <div>
          <button className={view === "price" ? "active" : ""} onClick={() => setView("price")}>{locale === "es" ? "Precio" : "Price"}</button>
          <button className={view === "return" ? "active" : ""} disabled={start <= 0 || values.length < 2} onClick={() => setView("return")}>{monthly ? (locale === "es" ? "Variación" : "Change") : (locale === "es" ? "Rentabilidad" : "Return")}</button>
          {!monthly && <button className={showAverage ? "active" : ""} aria-label={locale === "es" ? "Media móvil" : "Moving average"} aria-pressed={showAverage} onClick={() => setShowAverage((current) => !current)}>MA</button>}
        </div>
      </div>
      <div
        className="history-chart investment-chart"
        onMouseMove={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
          const target = ratio * width;
          setHovered(values.reduce((nearest, _, index) =>
            Math.abs(x(index) - target) < Math.abs(x(nearest) - target) ? index : nearest, 0));
        }}
        onMouseLeave={() => setHovered(null)}
      >
        <div className="history-scale"><span>{formatAxis(max)}</span><span>{formatAxis((max + min) / 2)}</span><span>{formatAxis(min)}</span></div>
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={monthly ? (locale === "es" ? "Precio medio por mes" : "Average price by month") : (locale === "es" ? "Precios de los últimos 30 días" : "Prices for the last 30 days")}>
          <defs><linearGradient id="sharedHistoryFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8b5cf6" stopOpacity=".32" /><stop offset="1" stopColor="#8b5cf6" stopOpacity="0" /></linearGradient></defs>
          {[0.25, 0.5, 0.75].map((position) => <line key={position} x1="0" x2={width} y1={height * position} y2={height * position} className="chart-grid-line" />)}
          {values.length > 1 && <polygon points={`${x(0)},${height} ${points} ${x(values.length - 1)},${height}`} fill="url(#sharedHistoryFill)" />}
          {!monthly && showAverage && <polyline points={averagePoints} className="history-average-line" vectorEffect="non-scaling-stroke" />}
          <polyline points={points} className="history-price-line" vectorEffect="non-scaling-stroke" />
          {values.map((point, index) => <circle key={point.date} cx={x(index)} cy={y(plotted[index])} r="4" className="chart-point" />)}
          <line x1={activeX} x2={activeX} y1="0" y2={height} className="chart-cursor" vectorEffect="non-scaling-stroke" />
          <circle cx={activeX} cy={activeY} r="5" className="chart-point" vectorEffect="non-scaling-stroke" />
        </svg>
        {hovered !== null && (
          <div className="history-tooltip" style={{ left: `${(activeX / width) * 100}%` }}>
            <strong>{formatCurrency(active.eur)}</strong>
            <span>{formatDate(active.date)}</span>
            {monthly && <span>{active.observations}/{active.expectedDays} {locale === "es" ? "días con precio" : "days with prices"}</span>}
          </div>
        )}
        <div className="history-dates"><span>{formatDate(windowStart)}</span><span>{windowStart !== windowEnd ? formatDate(windowEnd) : ""}</span></div>
      </div>
      {!monthly && <p className="history-caption">{values.length}/30 {locale === "es" ? "días con precio · Los días sin datos quedan vacíos" : "days with prices · Days without data are left blank"}</p>}
      {monthly && <p className="history-caption">{locale === "es" ? "Media mensual" : "Monthly average"} · {formatDate(active.date)} · {active.observations}/{active.expectedDays} {locale === "es" ? "días con precio" : "days with prices"}{active.observations < active.expectedDays ? (locale === "es" ? " · Mes parcial" : " · Partial month") : ""}</p>}
      {metrics && (
        <div className="investment-metrics">
          <div><TrendingUp size={14} /><span>{monthly ? (locale === "es" ? "Variación de medias" : "Change in averages") : (locale === "es" ? "Rentabilidad" : "Period return")}</span><strong className={positive ? "up" : "down"}>{metrics.returnPercent >= 0 ? "+" : ""}{metrics.returnPercent.toFixed(2)}%</strong></div>
          {!monthly && <div><Activity size={14} /><span>{locale === "es" ? "Volatilidad anual" : "Annualised volatility"}</span><strong>{metrics.annualizedVolatilityPercent.toFixed(1)}%</strong></div>}
          {!monthly && <div><TrendingDown size={14} /><span>Max drawdown</span><strong className="down">{metrics.maxDrawdownPercent.toFixed(1)}%</strong></div>}
          <div><BarChart3 size={14} /><span>{monthly ? (locale === "es" ? "Rango de medias" : "Average range") : (locale === "es" ? "Rango" : "Price range")}</span><strong>{formatCurrency(metrics.low)}–{formatCurrency(metrics.high)}</strong></div>
        </div>
      )}
    </div>
  );
}

export function CardDetailProvider({ children }: { children: ReactNode }) {
  const { locale, t } = useLanguage();
  const [card, setCard] = useState<CatalogCard | null>(null);
  const [cardId, setCardId] = useState("");
  const [history, setHistory] = useState<PriceHistoryPoint[]>([]);
  const [historyInterval, setHistoryInterval] = useState<PriceInterval>("daily");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const closeButton = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLElement | null>(null);

  const openCard = useCallback((next: CatalogCard | string) => {
    trigger.current = document.activeElement as HTMLElement | null;
    setCard(typeof next === "string" ? null : next);
    setCardId(typeof next === "string" ? next : next.id);
    setLoading(typeof next === "string");
    setHistory([]);
    setHistoryInterval("daily");
    setHistoryLoading(true);
    setHistoryError(false);
  }, []);

  const cardSurfaceProps = useCallback(
    (next: CatalogCard | string) => ({
      role: "group" as const,
      tabIndex: 0,
      onClick: (event: MouseEvent<HTMLElement>) => {
        if ((event.target as HTMLElement).closest("button, a, input, select, label")) return;
        openCard(next);
      },
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openCard(next);
        }
      },
      "aria-label": `${locale === "es" ? "Ver detalles de" : "View details for"} ${
        typeof next === "string" ? "card" : next.name
      }`,
    }),
    [locale, openCard],
  );

  useEffect(() => {
    if (!cardId || card?.id === cardId) return;
    const controller = new AbortController();
    fetch(`/api/cards/${cardId}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Card unavailable");
        return response.json() as Promise<{ card: CatalogCard }>;
      })
      .then((result) => setCard(result.card))
      .catch((error: Error) => {
        if (error.name !== "AbortError") setNotice("Unable to load card details");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [card, cardId]);

  useEffect(() => {
    if (!cardId) return;
    const controller = new AbortController();
    fetch(`/api/cards/${cardId}/history?interval=${historyInterval}`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error("History unavailable");
        return response.json() as Promise<{ history: PriceHistoryPoint[] }>;
      })
      .then((result) => {
        if (!controller.signal.aborted) setHistory(result.history);
      })
      .catch(() => {
        if (!controller.signal.aborted) setHistoryError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setHistoryLoading(false);
      });
    return () => controller.abort();
  }, [cardId, historyInterval]);

  useEffect(() => {
    if (!cardId) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    const close = () => setCardId("");
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") close();
      if (event.key === "Tab") {
        const focusable = document.querySelectorAll<HTMLElement>(
          '.card-detail button:not([disabled]), .card-detail a[href], .card-detail [tabindex]:not([tabindex="-1"])',
        );
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      trigger.current?.focus();
    };
  }, [cardId]);

  const addToWatchlist = async () => {
    if (!card) return;
    const response = await fetch("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: card.id }),
    });
    setNotice(
      response.ok
        ? locale === "es" ? "Añadida a seguimiento" : "Added to watchlist"
        : locale === "es" ? "No se pudo guardar" : "Unable to update watchlist",
    );
    window.setTimeout(() => setNotice(""), 2200);
  };

  const cardmarketUrl = card
    ? `https://www.cardmarket.com/en/Magic/Products/Search?searchString=${encodeURIComponent(card.name)}${
        process.env.NEXT_PUBLIC_CARDMARKET_REFERRER
          ? `&referrer=${encodeURIComponent(process.env.NEXT_PUBLIC_CARDMARKET_REFERRER)}`
          : ""
      }`
    : "";

  return (
    <CardDetailContext.Provider value={{ openCard, cardSurfaceProps }}>
      {children}
      {cardId && (
        <div className="card-detail-backdrop" onMouseDown={() => setCardId("")}>
          <article className="card-detail" role="dialog" aria-modal="true" aria-labelledby="shared-card-detail-title" onMouseDown={(event) => event.stopPropagation()}>
            <button ref={closeButton} className="detail-close" onClick={() => setCardId("")} aria-label={locale === "es" ? "Cerrar" : "Close"}><X size={18} /></button>
            {loading && !card ? <div className="card-detail-loading">Loading…</div> : card && (
              <>
                {card.imageUrl && <img src={card.imageUrl} alt={card.name} />}
                <div>
                  <span className="eyebrow">{card.setName}</span>
                  <h2 id="shared-card-detail-title">{card.name}</h2>
                  <p>{card.typeLine}</p>
                  <dl>
                    <div><dt>{t("Market price")}</dt><dd>{card.price === null ? "Unavailable" : formatCurrency(card.price)}</dd></div>
                    <div><dt>{t("Foil price")}</dt><dd>{card.foilPrice === null ? "Unavailable" : formatCurrency(card.foilPrice)}</dd></div>
                    <div><dt>{t("7-day movement")}</dt><dd className={card.change7d !== null && card.change7d >= 0 ? "up" : "down"}>{card.change7d === null ? "Unavailable" : `${card.change7d >= 0 ? "+" : ""}${card.change7d.toFixed(2)}%`}</dd></div>
                    <div><dt>{t("Printing")}</dt><dd>{card.setCode.toUpperCase()} #{card.collectorNumber}</dd></div>
                  </dl>
                  <div className="history-head"><strong>{locale === "es" ? "Historial de precios" : "Price history"}</strong><div role="group" aria-label={locale === "es" ? "Intervalo del gráfico" : "Chart interval"}>{(["daily", "monthly"] as const).map((interval) => <button key={interval} className={historyInterval === interval ? "active" : ""} aria-pressed={historyInterval === interval} onClick={() => {
                    if (interval === historyInterval) return;
                    setHistoryInterval(interval);
                    setHistory([]);
                    setHistoryLoading(true);
                    setHistoryError(false);
                  }}>{interval === "daily" ? (locale === "es" ? "Diario · 30 días" : "Daily · 30 days") : (locale === "es" ? "Mensual" : "Monthly")}</button>)}</div></div>
                  <p className="history-caption">{historyInterval === "daily" ? (locale === "es" ? "Precios registrados en los últimos 30 días." : "Recorded prices from the last 30 days.") : (locale === "es" ? "Una media por mes · Todo el historial disponible · Se excluyen los precios ausentes." : "One average per month · All available history · Missing prices excluded.")}</p>
                  {card.priceDate && <p className="history-caption">{locale === "es" ? "Último precio" : "Latest price"}: {card.priceDate} · MTGJSON · EUR</p>}
                  {historyLoading ? <div className="history-empty" role="status">{locale === "es" ? "Cargando precios…" : "Loading prices…"}</div> : historyError ? <div className="history-empty" role="alert">{locale === "es" ? "No se pudo cargar el historial." : "Unable to load price history."}</div> : <PriceHistoryChart key={`${cardId}-${historyInterval}`} history={history} locale={locale} interval={historyInterval} />}
                  <div className="detail-actions">
                    <Link href={`/portfolio?cardId=${card.id}`} onClick={() => setCardId("")}><Plus size={14} /> {t("Add holding")}</Link>
                    <button onClick={addToWatchlist}>{t("Watchlist")}</button>
                    <a href={cardmarketUrl} target="_blank" rel="noopener noreferrer sponsored">{t("View on Cardmarket")} <ExternalLink size={14} /></a>
                  </div>
                </div>
              </>
            )}
          </article>
        </div>
      )}
      {notice && <div className="toast">{notice}</div>}
    </CardDetailContext.Provider>
  );
}

export function useCardDetail() {
  const context = useContext(CardDetailContext);
  if (!context) throw new Error("useCardDetail must be used inside CardDetailProvider");
  return context;
}
