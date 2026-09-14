"use client";

/* eslint-disable @next/next/no-img-element */

import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  LoaderCircle,
  Search,
  Sparkles,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
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
  const { openCard } = useCardDetail();
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
  const [pulseSort, setPulseSort] = useState<MarketPulseSort>("release-desc");
  const [pulseLimit, setPulseLimit] = useState(120);
  const [selectedPulseCode, setSelectedPulseCode] = useState("");
  const [setCards, setSetCards] = useState<CatalogCard[]>([]);
  const [setCardsPage, setSetCardsPage] = useState(1);
  const [setCardsTotal, setSetCardsTotal] = useState(0);
  const [setCardsLoading, setSetCardsLoading] = useState(false);
  const [setCardsError, setSetCardsError] = useState(false);
  const [setCardsRetry, setSetCardsRetry] = useState(0);
  const setCardsPanel = useRef<HTMLElement>(null);

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

  useEffect(() => {
    if (!selectedPulseCode) return;
    const controller = new AbortController();
    const params = new URLSearchParams({
      set: selectedPulseCode,
      page: String(setCardsPage),
      limit: "24",
      sort: "name_asc",
    });
    fetch(`/api/cards?${params}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Unable to load set cards");
        return response.json() as Promise<{
          cards: CatalogCard[];
          total: number;
        }>;
      })
      .then((payload) => {
        setSetCards((current) =>
          setCardsPage === 1 ? payload.cards : [...current, ...payload.cards],
        );
        setSetCardsTotal(payload.total);
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") setSetCardsError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setSetCardsLoading(false);
      });
    return () => controller.abort();
  }, [selectedPulseCode, setCardsPage, setCardsRetry]);

  const visiblePulse = useMemo(() => {
    const search = pulseSearch.trim().toLowerCase();
    const filtered = search
      ? pulse.filter((set) =>
          set.name.toLowerCase().includes(search) ||
          set.code.toLowerCase().includes(search))
      : pulse;
    return sortMarketPulseSets(filtered, pulseSort);
  }, [pulse, pulseSearch, pulseSort]);

  const selectedPulseSet = pulse.find((set) => set.code === selectedPulseCode);

  const selectPulseSet = (code: string) => {
    if (selectedPulseCode !== code) {
      setSelectedPulseCode(code);
      setSetCards([]);
      setSetCardsPage(1);
      setSetCardsTotal(0);
      setSetCardsLoading(true);
      setSetCardsError(false);
    }
    window.requestAnimationFrame(() => {
      setCardsPanel.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const percent = (value: number | null, signed = false) =>
    value === null
      ? "—"
      : `${signed && value > 0 ? "+" : ""}${value.toFixed(1)}%`;

  return (
    <main className="account-page">
      <header className="account-topbar">
        <Link href="/" className="inventory-brand"><MagicBrainLogo /></Link>
        <nav><Link href="/market/latest-set-watch">Latest Set Watch</Link><Link href="/inventory">{t("Inventory")}</Link><Link href="/reserved">{t("Reserved List")}</Link><Link href="/signals">Brain Signals</Link></nav>
        <LanguageToggle />
        <AuthControl compact />
        <Link href="/" className="back-dashboard"><ArrowLeft size={15} /> {t("Dashboard")}</Link>
      </header>
      <div className="account-content market-page-content">
        <div className="account-heading">
          <div><span className="eyebrow">{locale === "es" ? "CONTEXTO PARA TU COLECCIÓN" : "CONTEXT FOR YOUR COLLECTION"}</span><h1>{locale === "es" ? "Evolución de precios" : "Price evolution"}</h1><p>{locale === "es" ? "Observa cómo cambian cartas y ediciones a partir del historial disponible." : "See how cards and sets change using the available price history."}</p></div>
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
          <div className="fintech-panel"><TrendingUp size={18} /><span>{locale === "es" ? `Movimiento al alza · ${days}D` : `Upward movement · ${days}D`}</span><strong className="up">{gainers[0]?.change7d != null ? `+${gainers[0].change7d.toFixed(1)}%` : "—"}</strong></div>
          <div className="fintech-panel"><TrendingDown size={18} /><span>{locale === "es" ? `Movimiento a la baja · ${days}D` : `Downward movement · ${days}D`}</span><strong className="down">{losers[0]?.change7d != null ? `${losers[0].change7d.toFixed(1)}%` : "—"}</strong></div>
          <Link className="fintech-panel latest-set-market-card" href="/market/latest-set-watch"><span>{locale === "es" ? "Radar de edición" : "Latest Set Watch"}</span><strong>{locale === "es" ? "Clasificación" : "Pick ranking"}</strong><small>{locale === "es" ? "señales explicables" : "explainable signals"}</small><Sparkles size={14} /></Link>
          <Link className="fintech-panel reserved-market-card" href="/reserved"><span>{t("Reserved List")}</span><strong>571</strong><small>{locale === "es" ? "cartas únicas" : "unique cards"}</small><ExternalLink size={14} /></Link>
        </section>
        {moverError && <p className="market-inline-state error" role="alert">{locale === "es" ? "No se pudo cargar el detalle de subidas y bajadas." : "The gainers and losers drilldown could not be loaded."}</p>}
        <div className={`market-columns ${loading ? "loading" : ""}`}>
          <section className="fintech-panel"><div className="section-title"><div><span className="eyebrow">{days}D</span><h2>{locale === "es" ? "Movimientos al alza" : "Notable upward movement"}</h2></div><TrendingUp className="up" size={20} /></div><MoverList cards={gainers} direction="up" days={days} /></section>
          <section className="fintech-panel"><div className="section-title"><div><span className="eyebrow">{days}D</span><h2>{locale === "es" ? "Movimientos a la baja" : "Notable downward movement"}</h2></div><TrendingDown className="down" size={20} /></div><MoverList cards={losers} direction="down" days={days} /></section>
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
                  <option value="release-desc">{locale === "es" ? "Más recientes primero" : "Newest first"}</option>
                  <option value="release-asc">{locale === "es" ? "Más antiguas primero" : "Oldest first"}</option>
                  <option value="name-asc">{locale === "es" ? "Nombre: A–Z" : "Name: A–Z"}</option>
                  <option value="name-desc">{locale === "es" ? "Nombre: Z–A" : "Name: Z–A"}</option>
                  <option value="median-desc">{locale === "es" ? "Rentabilidad mediana: mayor a menor" : "Median return: high to low"}</option>
                  <option value="median-asc">{locale === "es" ? "Rentabilidad mediana: menor a mayor" : "Median return: low to high"}</option>
                  <option value="breadth-desc">{locale === "es" ? "Amplitud: mayor a menor" : "Breadth: high to low"}</option>
                  <option value="breadth-asc">{locale === "es" ? "Amplitud: menor a mayor" : "Breadth: low to high"}</option>
                  <option value="coverage-desc">{locale === "es" ? "Cobertura: mayor a menor" : "Coverage: high to low"}</option>
                  <option value="coverage-asc">{locale === "es" ? "Cobertura: menor a mayor" : "Coverage: low to high"}</option>
                  <option value="tracked-desc">{locale === "es" ? "Cartas seguidas: más a menos" : "Tracked cards: most to least"}</option>
                  <option value="tracked-asc">{locale === "es" ? "Cartas seguidas: menos a más" : "Tracked cards: least to most"}</option>
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
                <button className={`market-pulse-row ${selectedPulseCode === set.code ? "selected" : ""}`} type="button" key={set.code} onClick={() => selectPulseSet(set.code)} aria-pressed={selectedPulseCode === set.code} aria-label={`${set.name} (${set.code.toUpperCase()}), ${locale === "es" ? "ver cartas de la edición" : "view cards in set"}`}>
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
                  <span className="market-pulse-action">{locale === "es" ? "Ver cartas" : "View cards"} <ArrowRight size={13} /></span>
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
        {selectedPulseCode && (
          <section ref={setCardsPanel} className="fintech-panel market-set-cards-panel" aria-busy={setCardsLoading}>
            <div className="market-set-cards-head">
              <div>
                <span className="eyebrow">{selectedPulseCode.toUpperCase()} · {locale === "es" ? "Edición seleccionada" : "Selected set"}</span>
                <h2>{selectedPulseSet?.name ?? selectedPulseCode.toUpperCase()}</h2>
                <p aria-live="polite">
                  {setCardsLoading && setCards.length === 0
                    ? locale === "es" ? "Cargando cartas…" : "Loading cards…"
                    : locale === "es"
                      ? `${setCards.length.toLocaleString(locale)} de ${setCardsTotal.toLocaleString(locale)} impresiones mostradas`
                      : `Showing ${setCards.length.toLocaleString(locale)} of ${setCardsTotal.toLocaleString(locale)} printings`}
                </p>
              </div>
              <button
                type="button"
                className="market-set-cards-close"
                onClick={() => setSelectedPulseCode("")}
              >
                <X size={15} />
                {locale === "es" ? "Cerrar" : "Close"}
              </button>
            </div>
            {setCardsError && setCards.length === 0 ? (
              <div className="market-pulse-state error" role="alert">
                <p>{locale === "es" ? "No se pudieron cargar las cartas de esta edición." : "Cards from this set could not be loaded."}</p>
                <button type="button" className="market-pulse-more" onClick={() => { setSetCardsLoading(true); setSetCardsError(false); setSetCardsRetry((value) => value + 1); }}>
                  {locale === "es" ? "Reintentar" : "Try again"}
                </button>
              </div>
            ) : !setCardsLoading && setCards.length === 0 ? (
              <div className="market-pulse-state">
                {locale === "es" ? "Esta edición aún no tiene impresiones en el catálogo." : "This set does not yet have printings in the catalogue."}
              </div>
            ) : (
              <>
                <div className="market-set-card-grid">
                  {setCards.map((card) => (
                    <button
                      type="button"
                      className="inventory-card"
                      key={card.id}
                      onClick={() => openCard(card)}
                      aria-label={`${locale === "es" ? "Ver detalles de" : "View details for"} ${card.name}`}
                    >
                      <div className="inventory-image">
                        {card.imageUrl ? <img src={card.imageUrl} alt="" /> : <span className="image-missing">{locale === "es" ? "Sin imagen" : "No image"}</span>}
                      </div>
                      <span className="inventory-card-copy">
                        <strong>{card.name}</strong>
                        <span>{card.collectorNumber} · {card.rarity}</span>
                        <div>
                          <b>{card.price === null ? "—" : formatCurrency(card.price)}</b>
                          {card.change7d !== null && <em className={card.change7d >= 0 ? "up" : "down"}>{card.change7d >= 0 ? "+" : ""}{card.change7d.toFixed(1)}%</em>}
                        </div>
                      </span>
                    </button>
                  ))}
                </div>
                {setCardsLoading && <div className="market-set-cards-loading" role="status"><LoaderCircle className="spin" size={16} /> {locale === "es" ? "Cargando más cartas…" : "Loading more cards…"}</div>}
                {setCardsError && setCards.length > 0 && (
                  <div className="market-set-cards-retry" role="alert">
                    <span>{locale === "es" ? "No se pudieron cargar más cartas." : "More cards could not be loaded."}</span>
                    <button type="button" onClick={() => { setSetCardsLoading(true); setSetCardsError(false); setSetCardsRetry((value) => value + 1); }}>{locale === "es" ? "Reintentar" : "Try again"}</button>
                  </div>
                )}
                {setCards.length < setCardsTotal && !setCardsLoading && (
                  <button className="market-pulse-more" type="button" onClick={() => { setSetCardsLoading(true); setSetCardsError(false); setSetCardsPage((page) => page + 1); }}>
                    {locale === "es" ? `Mostrar más (${setCardsTotal - setCards.length} restantes)` : `Show more (${setCardsTotal - setCards.length} remaining)`}
                  </button>
                )}
              </>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
