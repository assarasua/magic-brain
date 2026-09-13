"use client";

/* eslint-disable @next/next/no-img-element */

import {
  ArrowLeft,
  Heart,
  LoaderCircle,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AuthControl } from "@/components/auth-control";
import { MagicBrainLogo } from "@/components/brand-logo";
import { useCardDetail } from "@/components/card-detail-provider";
import { LanguageToggle, useLanguage } from "@/components/language-provider";
import { MlInsight, trackMlFeedback } from "@/components/ml-insight";
import { ProBadge } from "@/components/magic-brain-pro";
import type { DiscoveryCard } from "@/lib/discovery";
import { formatCurrency } from "@/lib/data";
import type { MlCardContext, MlRankingStatus } from "@/lib/ml-experience";

type RankedDiscoveryCard = DiscoveryCard & { ml?: MlCardContext | null };

const fallbackRanking: MlRankingStatus = {
  source: "deterministic",
  reason: "scores_missing_or_stale",
  modelVersion: null,
  scoreDate: null,
};

export default function DiscoverPage() {
  const { locale, t } = useLanguage();
  const { openCard } = useCardDetail();
  const es = locale === "es";
  const [cards, setCards] = useState<RankedDiscoveryCard[]>([]);
  const [ranking, setRanking] = useState<MlRankingStatus>(fallbackRanking);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragX, setDragX] = useState(0);
  const [notice, setNotice] = useState("");
  const [history, setHistory] = useState<Array<{
    cardId: string;
    decision: "liked" | "passed";
    addedToWatchlist: boolean;
  }>>([]);

  const loadCards = useCallback(() => {
    setLoading(true);
    setIndex(0);
    setHistory([]);
    fetch("/api/discover")
      .then(async (response) => {
        if (response.status === 403) return { cards: [], ranking: fallbackRanking };
        if (!response.ok) throw new Error("Unable to load cards");
        return response.json() as Promise<{ cards: RankedDiscoveryCard[]; ranking: MlRankingStatus }>;
      })
      .then((result) => {
        setCards(result.cards);
        if (result.ranking) setRanking(result.ranking);
      })
      .catch(() => setCards([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/discover", { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 403) return { cards: [], ranking: fallbackRanking };
        if (!response.ok) throw new Error("Unable to load cards");
        return response.json() as Promise<{ cards: RankedDiscoveryCard[]; ranking: MlRankingStatus }>;
      })
      .then((result) => {
        setCards(result.cards);
        if (result.ranking) setRanking(result.ranking);
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") setCards([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const current = cards[index];

  const decide = useCallback(async (decision: "liked" | "passed") => {
    if (!current || saving) return;
    setSaving(true);
    setDragX(decision === "liked" ? 520 : -520);
    const response = await fetch("/api/discover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: current.id, decision }),
    });

    if (response.ok) {
      const result = await response.json() as { addedToWatchlist?: boolean };
      setNotice(
        decision === "liked"
          ? es ? "Añadida a tu watchlist" : "Added to your watchlist"
          : es ? "Descartada" : "Passed",
      );
      window.setTimeout(() => setNotice(""), 1500);
      window.setTimeout(() => {
        setHistory((items) => [...items, {
          cardId: current.id,
          decision,
          addedToWatchlist: result.addedToWatchlist === true,
        }]);
        setIndex((value) => value + 1);
        setDragX(0);
        setSaving(false);
      }, 180);
      if (current.ml) {
        trackMlFeedback({
          eventType: decision === "liked" ? "save_to_watchlist" : "dismiss",
          surface: "discover",
          cardId: current.id,
          context: current.ml,
          rankPosition: index + 1,
        });
      }
    } else {
      setNotice(es ? "No se pudo guardar. Inténtalo de nuevo." : "Could not save. Try again.");
      setDragX(0);
      setSaving(false);
    }
  }, [current, es, index, saving]);

  const undo = useCallback(async () => {
    const previous = history.at(-1);
    if (!previous || saving) return;
    setSaving(true);
    const response = await fetch("/api/discover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cardId: previous.cardId,
        decision: "undo",
        removeFromWatchlist: previous.addedToWatchlist,
      }),
    });
    if (response.ok) {
      setHistory((items) => items.slice(0, -1));
      setIndex((value) => Math.max(0, value - 1));
      setNotice(es ? "Última decisión deshecha" : "Last decision undone");
      window.setTimeout(() => setNotice(""), 1500);
    } else {
      setNotice(es ? "No se pudo deshacer" : "Could not undo");
    }
    setSaving(false);
  }, [es, history, saving]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") void decide("passed");
      if (event.key === "ArrowRight") void decide("liked");
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [decide]);

  return (
    <main className="account-page discovery-page">
      <header className="account-topbar">
        <Link href="/" className="inventory-brand"><MagicBrainLogo /></Link>
        <nav><Link href="/market">{t("Market")}</Link><Link href="/watchlist">{t("Watchlist")}</Link><Link href="/settings">{t("Settings")}</Link></nav>
        <LanguageToggle />
        <AuthControl compact />
        <Link href="/" className="back-dashboard"><ArrowLeft size={15} /> {t("Dashboard")}</Link>
      </header>

      <div className="discovery-content">
          <div className="discovery-heading">
            <ProBadge />
            <h1>{es ? "Descubre tu próxima carta." : "Discover your next card."}</h1>
            <p>{es ? "Una selección personal basada en tus preferencias. Desliza a la derecha para guardarla en seguimiento." : "A personal selection based on your preferences. Swipe right to add a card to your watchlist."}</p>
            <Link href="/settings"><SlidersHorizontal size={14} /> {es ? "Ajustar preferencias" : "Tune preferences"}</Link>
          </div>
          <MlInsight locale={locale} ranking={ranking} surface="discover" />

          {loading ? (
            <div className="discovery-loading"><LoaderCircle className="spin" size={25} /> {es ? "Buscando cartas compatibles…" : "Finding your best matches…"}</div>
          ) : current ? (
            <div className="discovery-stage">
              <MlInsight
                locale={locale}
                ranking={ranking}
                context={current.ml ?? undefined}
                surface="discover"
                cardId={current.id}
                rankPosition={index + 1}
              />
              <div className="discovery-session">
                <div><strong>{es ? "Selección de hoy" : "Today's selection"}</strong><span>{cards.length - index} {es ? "por revisar" : "left"}</span></div>
                <div className="discovery-progress"><span style={{ width: `${Math.max(4, (index / cards.length) * 100)}%` }} /></div>
                {index === 0 && <small><X size={11} /> {es ? "Desliza para pasar" : "Swipe to pass"} <Heart size={11} /> {es ? "Desliza para guardar" : "Swipe to save"}</small>}
              </div>
              <div className="discovery-deck">
                {cards[index + 1] && <div className="discovery-card behind" style={{ transform: `translateY(${12 - Math.min(Math.abs(dragX) / 30, 6)}px) scale(${0.96 + Math.min(Math.abs(dragX) / 6000, 0.025)})` }}><img src={cards[index + 1].imageUrl} alt="" /></div>}
                <article
                  className={`discovery-card active ${dragStart !== null ? "dragging" : ""} ${dragX > 80 ? "liking" : dragX < -80 ? "passing" : ""}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${es ? "Ver detalles de" : "View details for"} ${current.name}`}
                  style={{ transform: `translateX(${dragX}px) rotate(${dragX / 28}deg)` }}
                  onPointerDown={(event) => {
                    setDragStart(event.clientX);
                    event.currentTarget.setPointerCapture(event.pointerId);
                  }}
                  onPointerMove={(event) => {
                    if (dragStart !== null && !saving) setDragX(event.clientX - dragStart);
                  }}
                  onPointerUp={() => {
                    if (dragX > 100) void decide("liked");
                    else if (dragX < -100) void decide("passed");
                    else setDragX(0);
                    setDragStart(null);
                  }}
                  onPointerCancel={() => {
                    setDragStart(null);
                    setDragX(0);
                  }}
                  onClick={() => {
                    if (Math.abs(dragX) < 8 && !saving) {
                      if (current.ml) {
                        trackMlFeedback({
                          eventType: "open_details",
                          surface: "discover",
                          cardId: current.id,
                          context: current.ml,
                          rankPosition: index + 1,
                        });
                      }
                      openCard(current.id);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openCard(current.id);
                    }
                  }}
                >
                  <span className="swipe-stamp pass">{es ? "PASAR" : "PASS"}</span>
                  <span className="swipe-stamp like">{es ? "ME INTERESA" : "INTERESTED"}</span>
                  <img src={current.imageUrl} alt={current.name} draggable={false} />
                  <div className="discovery-card-info">
                    <div className="discovery-match"><Sparkles size={13} /> {current.matchScore}% {es ? "compatible" : "match"}</div>
                    <h2>{current.name}</h2>
                    <p>{current.setName} · {current.setCode.toUpperCase()} · {current.rarity}</p>
                    <div className="discovery-price"><strong>{formatCurrency(current.price)}</strong><span className={current.change7d >= 0 ? "up" : "down"}>{current.change7d >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}{current.change7d >= 0 ? "+" : ""}{current.change7d.toFixed(1)}% <small>7D</small></span></div>
                    <div className="discovery-signal-grid">
                      <span><small>30D</small><strong className={current.change30d >= 0 ? "up" : "down"}>{current.change30d >= 0 ? "+" : ""}{current.change30d.toFixed(1)}%</strong></span>
                      <span><small>{es ? "AFINIDAD" : "MATCH"}</small><strong>{current.matchScore}/100</strong></span>
                      <span><small>{es ? "RAREZA" : "RARITY"}</small><strong>{current.rarity}</strong></span>
                    </div>
                    <div className="discovery-reason">{current.rationale}</div>
                    <div className="discovery-tags"><span>{current.typeLine}</span>{current.reserved && <b>Reserved List</b>}</div>
                  </div>
                </article>
              </div>
              <div className="discovery-controls">
                <button className="undo" onClick={undo} disabled={saving || history.length === 0} aria-label={es ? "Deshacer última decisión" : "Undo last decision"}><RotateCcw size={18} /><small>{es ? "Deshacer" : "Undo"}</small></button>
                <button className="pass" onClick={() => decide("passed")} disabled={saving} aria-label={es ? "Descartar carta" : "Pass card"}><X size={24} /><small>{es ? "Pasar" : "Pass"}</small></button>
                <button className="like" onClick={() => decide("liked")} disabled={saving} aria-label={es ? "Guardar en watchlist" : "Save to watchlist"}><Heart size={23} /><small>{es ? "Guardar" : "Save"}</small></button>
              </div>
            </div>
          ) : (
            <div className="discovery-empty">
              <Sparkles size={28} />
              <h2>{es ? "Has revisado todas tus recomendaciones." : "You reviewed every recommendation."}</h2>
              <p>{es ? "Ajusta tus preferencias para descubrir otro segmento del mercado." : "Change your preferences to discover another part of the market."}</p>
              <div><Link href="/settings"><SlidersHorizontal size={15} /> {es ? "Cambiar preferencias" : "Change preferences"}</Link><button onClick={loadCards}><RotateCcw size={15} /> {es ? "Actualizar" : "Refresh"}</button></div>
            </div>
          )}
      </div>
      {notice && <div className="toast">{notice}</div>}
    </main>
  );
}
