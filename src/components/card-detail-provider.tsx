"use client";

/* eslint-disable @next/next/no-img-element */

import { ExternalLink, Plus, X } from "lucide-react";
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

function PriceHistoryChart({ history }: { history: PricePoint[] }) {
  const values = history.filter((point) => point.eur !== null) as Array<
    PricePoint & { eur: number }
  >;
  if (values.length < 2) {
    return <div className="history-empty">No historical prices available.</div>;
  }
  const width = 520;
  const height = 150;
  const min = Math.min(...values.map((point) => point.eur));
  const max = Math.max(...values.map((point) => point.eur));
  const points = values
    .map((point, index) => {
      const x = (index / (values.length - 1)) * width;
      const y =
        height -
        ((point.eur - min) / Math.max(max - min, 0.01)) * (height - 12) -
        6;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="history-chart">
      <div className="history-scale"><span>{formatCurrency(max)}</span><span>{formatCurrency(min)}</span></div>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <defs><linearGradient id="sharedHistoryFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#48b9ff" stopOpacity=".3" /><stop offset="1" stopColor="#48b9ff" stopOpacity="0" /></linearGradient></defs>
        <polygon points={`0,${height} ${points} ${width},${height}`} fill="url(#sharedHistoryFill)" />
        <polyline points={points} fill="none" stroke="#48b9ff" strokeWidth="3" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="history-dates"><span>{values[0].date}</span><span>{values.at(-1)?.date}</span></div>
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
                  <PriceHistoryChart history={history} />
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
