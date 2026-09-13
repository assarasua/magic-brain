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

type PricePoint = { date: string; eur: number | null; eurFoil: number | null };

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

function PriceHistoryChart({
  history,
  locale,
}: {
  history: PricePoint[];
  locale: "en" | "es";
}) {
  const [view, setView] = useState<"price" | "return">("price");
  const [showAverage, setShowAverage] = useState(true);
  const [hovered, setHovered] = useState<number | null>(null);
  const values = history.filter((point) => point.eur !== null) as Array<
    PricePoint & { eur: number }
  >;
  if (values.length < 2) {
    return <div className="history-empty">No historical prices available.</div>;
  }
  const metrics = calculateSeriesMetrics(
    values.map((point) => ({ date: point.date, value: point.eur })),
  );
  const average = movingAverage(
    values.map((point) => ({ date: point.date, value: point.eur })),
    Math.min(30, Math.max(7, Math.round(values.length / 6))),
  );
  const start = values[0].eur;
  const plotted = values.map((point) =>
    view === "price" ? point.eur : ((point.eur - start) / start) * 100,
  );
  const averagePlotted = average.map((point) =>
    view === "price" ? point.value : ((point.value - start) / start) * 100,
  );
  const width = 720;
  const height = 230;
  const min = Math.min(...plotted);
  const max = Math.max(...plotted);
  const y = (value: number) =>
    height - ((value - min) / Math.max(max - min, 0.01)) * (height - 20) - 10;
  const points = plotted
    .map((point, index) => {
      const x = (index / (values.length - 1)) * width;
      return `${x},${y(point)}`;
    })
    .join(" ");
  const averagePoints = averagePlotted
    .map((point, index) => `${(index / (values.length - 1)) * width},${y(point)}`)
    .join(" ");
  const activeIndex = hovered ?? values.length - 1;
  const active = values[activeIndex];
  const activeValue = plotted[activeIndex];
  const activeX = (activeIndex / (values.length - 1)) * width;
  const activeY = y(activeValue);
  const positive = (metrics?.returnPercent ?? 0) >= 0;
  const formatAxis = (value: number) =>
    view === "price" ? formatCurrency(value) : `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;

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
          <button className={view === "return" ? "active" : ""} onClick={() => setView("return")}>{locale === "es" ? "Rentabilidad" : "Return"}</button>
          <button className={showAverage ? "active" : ""} aria-pressed={showAverage} onClick={() => setShowAverage((current) => !current)}>MA</button>
        </div>
      </div>
      <div
        className="history-chart investment-chart"
        onMouseMove={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
          setHovered(Math.round(ratio * (values.length - 1)));
        }}
        onMouseLeave={() => setHovered(null)}
      >
        <div className="history-scale"><span>{formatAxis(max)}</span><span>{formatAxis((max + min) / 2)}</span><span>{formatAxis(min)}</span></div>
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
          <defs><linearGradient id="sharedHistoryFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8b5cf6" stopOpacity=".32" /><stop offset="1" stopColor="#8b5cf6" stopOpacity="0" /></linearGradient></defs>
          {[0.25, 0.5, 0.75].map((position) => <line key={position} x1="0" x2={width} y1={height * position} y2={height * position} className="chart-grid-line" />)}
          <polygon points={`0,${height} ${points} ${width},${height}`} fill="url(#sharedHistoryFill)" />
          {showAverage && <polyline points={averagePoints} className="history-average-line" vectorEffect="non-scaling-stroke" />}
          <polyline points={points} className="history-price-line" vectorEffect="non-scaling-stroke" />
          <line x1={activeX} x2={activeX} y1="0" y2={height} className="chart-cursor" vectorEffect="non-scaling-stroke" />
          <circle cx={activeX} cy={activeY} r="5" className="chart-point" vectorEffect="non-scaling-stroke" />
        </svg>
        {hovered !== null && (
          <div className="history-tooltip" style={{ left: `${(activeIndex / (values.length - 1)) * 100}%` }}>
            <strong>{formatCurrency(active.eur)}</strong>
            <span>{new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(active.date))}</span>
          </div>
        )}
        <div className="history-dates"><span>{values[0].date}</span><span>{values.at(-1)?.date}</span></div>
      </div>
      {metrics && (
        <div className="investment-metrics">
          <div><TrendingUp size={14} /><span>{locale === "es" ? "Rentabilidad" : "Period return"}</span><strong className={positive ? "up" : "down"}>{metrics.returnPercent >= 0 ? "+" : ""}{metrics.returnPercent.toFixed(2)}%</strong></div>
          <div><Activity size={14} /><span>{locale === "es" ? "Volatilidad anual" : "Annualised volatility"}</span><strong>{metrics.annualizedVolatilityPercent.toFixed(1)}%</strong></div>
          <div><TrendingDown size={14} /><span>Max drawdown</span><strong className="down">{metrics.maxDrawdownPercent.toFixed(1)}%</strong></div>
          <div><BarChart3 size={14} /><span>{locale === "es" ? "Rango" : "Price range"}</span><strong>{formatCurrency(metrics.low)}–{formatCurrency(metrics.high)}</strong></div>
        </div>
      )}
    </div>
  );
}

export function CardDetailProvider({ children }: { children: ReactNode }) {
  const { locale, t } = useLanguage();
  const [card, setCard] = useState<CatalogCard | null>(null);
  const [cardId, setCardId] = useState("");
  const [history, setHistory] = useState<PricePoint[]>([]);
  const [historyDays, setHistoryDays] = useState(90);
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
    setHistoryDays(90);
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
    fetch(`/api/cards/${cardId}/history?days=${historyDays}`, {
      signal: controller.signal,
    })
      .then((response) => response.json())
      .then((result: { history?: PricePoint[] }) => setHistory(result.history ?? []))
      .catch(() => setHistory([]));
    return () => controller.abort();
  }, [cardId, historyDays]);

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
                  <div className="history-head"><strong>{t("Daily price history")}</strong><div>{[30, 90, 180, 365].map((days) => <button key={days} className={historyDays === days ? "active" : ""} onClick={() => setHistoryDays(days)}>{days === 365 ? "1Y" : `${days}D`}</button>)}</div></div>
                  <PriceHistoryChart history={history} locale={locale} />
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
