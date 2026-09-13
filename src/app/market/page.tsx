"use client";

/* eslint-disable @next/next/no-img-element */

import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Search,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { LanguageToggle, useLanguage } from "@/components/language-provider";
import { AuthControl } from "@/components/auth-control";
import { MagicBrainLogo } from "@/components/brand-logo";
import { useCardDetail } from "@/components/card-detail-provider";
import { SetSelector } from "@/components/set-selector";
import type { CatalogCard } from "@/lib/catalog";
import { formatCurrency } from "@/lib/data";
import {
  sortMarketPulseSets,
  type MarketPulseSet,
  type MarketPulseSort,
} from "@/lib/market-pulse-model";

function MoverList({
  cards,
  direction,
  days,
}: {
  cards: CatalogCard[];
  direction: "up" | "down";
  days: number;
}) {
  const { cardSurfaceProps } = useCardDetail();
  return (
    <div className="market-list">
      {cards.map((card, index) => (
        <div className="market-card-link card-surface" key={card.id} {...cardSurfaceProps(card)}>
          <span className="market-rank">{String(index + 1).padStart(2, "0")}</span>
          {card.imageUrl && <img src={card.imageUrl} alt="" />}
          <div><strong>{card.name}</strong><span>{card.setCode.toUpperCase()} · {card.setName}</span></div>
          <div><strong>{card.price === null ? "—" : formatCurrency(card.price)}</strong><em className={direction === "up" ? "up" : "down"}>{direction === "up" ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{card.change7d === null ? "—" : `${Math.abs(card.change7d).toFixed(1)}%`} <small>{days}D</small></em></div>
          <ArrowRight size={14} />
        </div>
      ))}
    </div>
  );
}

export default function MarketPage() {
  const { locale, t } = useLanguage();
  const [days, setDays] = useState(7);
  const [setCodes, setSetCodes] = useState<string[]>([]);
  const [gainers, setGainers] = useState<CatalogCard[]>([]);
  const [losers, setLosers] = useState<CatalogCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [moverError, setMoverError] = useState(false);
  const [pulse, setPulse] = useState<MarketPulseSet[]>([]);
  const [pulseLoading, setPulseLoading] = useState(true);
  const [pulseError, setPulseError] = useState(false);
  const [pulseSearch, setPulseSearch] = useState("");
  const [pulseSort, setPulseSort] = useState<MarketPulseSort>("release");
  const [pulseLimit, setPulseLimit] = useState(120);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch(`/api/market/movers?direction=gainers&days=${days}${setCodes[0] ? `&set=${encodeURIComponent(setCodes[0])}` : ""}`, { signal: controller.signal }).then((response) => {
        if (!response.ok) throw new Error("Unable to load gainers");
        return response.json() as Promise<{ cards: CatalogCard[] }>;
      }),
      fetch(`/api/market/movers?direction=losers&days=${days}${setCodes[0] ? `&set=${encodeURIComponent(setCodes[0])}` : ""}`, { signal: controller.signal }).then((response) => {
        if (!response.ok) throw new Error("Unable to load losers");
        return response.json() as Promise<{ cards: CatalogCard[] }>;
      }),
    ])
      .then(([up, down]) => {
        setGainers(up.cards);
        setLosers(down.cards);
        setMoverError(false);
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") {
          setGainers([]);
          setLosers([]);
          setMoverError(true);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [days, setCodes]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/market/pulse?days=${days}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Unable to load market pulse");
        return response.json() as Promise<{ sets: MarketPulseSet[] }>;
      })
      .then((payload) => setPulse(payload.sets))
      .catch((error: Error) => {
        if (error.name !== "AbortError") {
          setPulse([]);
          setPulseError(true);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setPulseLoading(false);
      });
    return () => controller.abort();
  }, [days]);

  const visiblePulse = useMemo(() => {
    const search = pulseSearch.trim().toLowerCase();
    const filtered = search
      ? pulse.filter((set) =>
          set.name.toLowerCase().includes(search) ||
          set.code.toLowerCase().includes(search))
      : pulse;
    return sortMarketPulseSets(filtered, pulseSort);
  }, [pulse, pulseSearch, pulseSort]);

  const selectPulseSet = (code: string) => {
    setLoading(true);
    setSetCodes([code]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const percent = (value: number | null, signed = false) =>
    value === null
      ? "—"
      : `${signed && value > 0 ? "+" : ""}${value.toFixed(1)}%`;

  return (
    <main className="account-page">
      <header className="account-topbar">
        <Link href="/" className="inventory-brand"><MagicBrainLogo /></Link>
        <nav><Link href="/market/latest-set-watch">Latest Set Watch</Link><Link href="/inventory">{t("Inventory")}</Link><Link href="/reserved">{t("Reserved List")}</Link><Link href="/brain-pro">Brain Pro</Link></nav>
        <LanguageToggle />
        <AuthControl compact />
        <Link href="/" className="back-dashboard"><ArrowLeft size={15} /> {t("Dashboard")}</Link>
      </header>
      <div className="account-content market-page-content">
        <div className="account-heading">
          <div><span className="eyebrow">{locale === "es" ? "Inteligencia diaria" : "Daily intelligence"}</span><h1>{locale === "es" ? "Pulso del mercado" : "Market pulse"}</h1><p>{locale === "es" ? "Movimientos de precio calculados con tu histórico real." : "Price movement calculated from your live historical dataset."}</p></div>
          <div className="market-heading-filters">
            <SetSelector
              value={setCodes}
              onChange={(codes) => {
                setLoading(true);
                setSetCodes(codes);
              }}
              label={locale === "es" ? "Edición" : "Set"}
              allLabel={locale === "es" ? "Todas" : "All sets"}
            />
            <div className="market-period" aria-label={locale === "es" ? "Periodo de mercado" : "Market period"}>{[1, 7, 30].map((value) => <button className={days === value ? "active" : ""} aria-pressed={days === value} key={value} onClick={() => { if (days !== value) { setLoading(true); setPulseLoading(true); setPulseError(false); setDays(value); } }}>{value}D</button>)}</div>
          </div>
        </div>
        <section className="market-summary" aria-live="polite" aria-busy={loading}>
          <div className="fintech-panel"><span>{locale === "es" ? "Universo analizado" : "Analysed universe"}</span><strong>{setCodes[0]?.toUpperCase() ?? (pulseLoading ? "—" : pulse.length.toLocaleString(locale))}</strong><small>{setCodes[0] ? (locale === "es" ? "edición seleccionada" : "selected set") : (locale === "es" ? "ediciones normalizadas" : "normalized sets")}</small></div>
          <div className="fintech-panel"><TrendingUp size={18} /><span>{locale === "es" ? `Mayor subida · ${days}D` : `Top gain · ${days}D`}</span><strong className="up">{gainers[0]?.change7d != null ? `+${gainers[0].change7d.toFixed(1)}%` : "—"}</strong></div>
          <div className="fintech-panel"><TrendingDown size={18} /><span>{locale === "es" ? `Mayor bajada · ${days}D` : `Top decline · ${days}D`}</span><strong className="down">{losers[0]?.change7d != null ? `${losers[0].change7d.toFixed(1)}%` : "—"}</strong></div>
          <Link className="fintech-panel latest-set-market-card" href="/market/latest-set-watch"><span>{locale === "es" ? "Radar de edición" : "Latest Set Watch"}</span><strong>{locale === "es" ? "Clasificación" : "Pick ranking"}</strong><small>{locale === "es" ? "señales explicables" : "explainable signals"}</small><Sparkles size={14} /></Link>
          <Link className="fintech-panel reserved-market-card" href="/reserved"><span>{t("Reserved List")}</span><strong>571</strong><small>{locale === "es" ? "cartas únicas" : "unique cards"}</small><ExternalLink size={14} /></Link>
        </section>
        {moverError && <p className="market-inline-state error" role="alert">{locale === "es" ? "No se pudo cargar el detalle de subidas y bajadas." : "The gainers and losers drilldown could not be loaded."}</p>}
        <div className={`market-columns ${loading ? "loading" : ""}`}>
          <section className="fintech-panel"><div className="section-title"><div><span className="eyebrow">{days}D</span><h2>{locale === "es" ? "Mayores subidas" : "Top gainers"}</h2></div><TrendingUp className="up" size={20} /></div><MoverList cards={gainers} direction="up" days={days} /></section>
          <section className="fintech-panel"><div className="section-title"><div><span className="eyebrow">{days}D</span><h2>{locale === "es" ? "Mayores bajadas" : "Top losers"}</h2></div><TrendingDown className="down" size={20} /></div><MoverList cards={losers} direction="down" days={days} /></section>
        </div>
        <section className="fintech-panel market-pulse-panel" aria-busy={pulseLoading}>
          <div className="market-pulse-head">
            <div>
              <span className="eyebrow">{days}D · {locale === "es" ? "Todas las ediciones" : "All sets"}</span>
              <h2>{locale === "es" ? "Pulso por edición" : "Pulse by set"}</h2>
              <p>{locale === "es" ? "Rendimiento mediano y amplitud de cartas no foil en EUR con precios comparables." : "Median return and breadth for EUR non-foil cards with comparable prices."}</p>
            </div>
            <div className="market-pulse-tools">
              <label className="market-pulse-search">
                <Search size={14} />
                <span className="sr-only">{locale === "es" ? "Buscar ediciones" : "Search sets"}</span>
                <input value={pulseSearch} onChange={(event) => { setPulseSearch(event.target.value); setPulseLimit(120); }} placeholder={locale === "es" ? "Buscar edición o código…" : "Search set or code…"} />
              </label>
              <label>
                <span className="sr-only">{locale === "es" ? "Ordenar ediciones" : "Sort sets"}</span>
                <select value={pulseSort} onChange={(event) => { setPulseSort(event.target.value as MarketPulseSort); setPulseLimit(120); }}>
                  <option value="release">{locale === "es" ? "Más recientes" : "Newest release"}</option>
                  <option value="name">{locale === "es" ? "Nombre" : "Name"}</option>
                  <option value="median">{locale === "es" ? "Rentabilidad mediana" : "Median return"}</option>
                  <option value="breadth">{locale === "es" ? "Amplitud" : "Breadth"}</option>
                  <option value="coverage">{locale === "es" ? "Cobertura" : "Coverage"}</option>
                  <option value="tracked">{locale === "es" ? "Cartas seguidas" : "Tracked cards"}</option>
                </select>
              </label>
            </div>
          </div>
          {pulseLoading ? (
            <div className="market-pulse-state" role="status">{locale === "es" ? `Calculando el pulso de ${days}D…` : `Calculating ${days}D pulse…`}</div>
          ) : pulseError ? (
            <div className="market-pulse-state error" role="alert">{locale === "es" ? "No se pudo cargar el pulso por edición." : "Set-wide market pulse could not be loaded."}</div>
          ) : visiblePulse.length === 0 ? (
            <div className="market-pulse-state">{locale === "es" ? "Ninguna edición coincide con la búsqueda." : "No sets match your search."}</div>
          ) : (
            <div className="market-pulse-table">
              <div className="market-pulse-row market-pulse-columns" aria-hidden="true">
                <span>{locale === "es" ? "Edición" : "Set"}</span><span>{locale === "es" ? "Seguimiento" : "Tracked"}</span><span>{locale === "es" ? `Mediana ${days}D` : `${days}D median`}</span><span>{locale === "es" ? "Avance / descenso" : "Advance / decline"}</span><span>{locale === "es" ? "Amplitud" : "Breadth"}</span><span>{locale === "es" ? "Líder" : "Leading mover"}</span>
              </div>
              {visiblePulse.slice(0, pulseLimit).map((set) => (
                <button className="market-pulse-row" type="button" key={set.code} onClick={() => selectPulseSet(set.code)} aria-label={`${set.name} (${set.code.toUpperCase()}), ${locale === "es" ? "abrir detalle" : "open drilldown"}`}>
                  <span className="market-pulse-set"><strong>{set.name}</strong><small>{set.code.toUpperCase()}{set.releasedAt ? ` · ${set.releasedAt}` : ""}</small></span>
                  {set.available ? (
                    <>
                      <span data-label={locale === "es" ? "Seguimiento" : "Tracked"}><strong>{set.trackedCards.toLocaleString(locale)} / {set.cardCount.toLocaleString(locale)}</strong><small>{percent(set.coveragePercent)} {locale === "es" ? "cobertura" : "coverage"}</small></span>
                      <span data-label={locale === "es" ? `Mediana ${days}D` : `${days}D median`} className={(set.medianReturn ?? 0) > 0 ? "up" : (set.medianReturn ?? 0) < 0 ? "down" : ""}><strong>{percent(set.medianReturn, true)}</strong></span>
                      <span data-label={locale === "es" ? "Avance / descenso" : "Advance / decline"}><strong><em className="up">{set.advancers}</em> / <em className="down">{set.decliners}</em></strong></span>
                      <span data-label={locale === "es" ? "Amplitud" : "Breadth"} className={(set.breadth ?? 0) > 0 ? "up" : (set.breadth ?? 0) < 0 ? "down" : ""}><strong>{percent(set.breadth, true)}</strong></span>
                      <span data-label={locale === "es" ? "Líder" : "Leading mover"}><strong>{set.leadingMover?.name ?? "—"}</strong><small className={(set.leadingMover?.returnPercent ?? 0) >= 0 ? "up" : "down"}>{percent(set.leadingMover?.returnPercent ?? null, true)}</small></span>
                    </>
                  ) : (
                    <span className="market-pulse-unavailable">{locale === "es" ? `Sin comparación válida para ${days}D` : `No valid ${days}D comparison`}</span>
                  )}
                  <ArrowRight size={14} />
                </button>
              ))}
              {visiblePulse.length > pulseLimit && (
                <button className="market-pulse-more" type="button" onClick={() => setPulseLimit((current) => current + 120)}>
                  {locale === "es" ? `Mostrar más (${visiblePulse.length - pulseLimit} restantes)` : `Show more (${visiblePulse.length - pulseLimit} remaining)`}
                </button>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
