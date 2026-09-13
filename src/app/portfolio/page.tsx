"use client";

/* eslint-disable @next/next/no-img-element */

import {
  ArrowLeft,
  Plus,
  Search,
  Sparkles,
  Trash2,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { LanguageToggle, useLanguage } from "@/components/language-provider";
import { AuthControl } from "@/components/auth-control";
import { MagicBrainLogo } from "@/components/brand-logo";
import { useCardDetail } from "@/components/card-detail-provider";
import { PortfolioOnboarding } from "@/components/portfolio-onboarding";
import { CARD_LANGUAGES, type CardLanguage } from "@/lib/card-languages";
import type { CatalogCard } from "@/lib/catalog";
import { formatCurrency } from "@/lib/data";
import { calculateSeriesMetrics } from "@/lib/financial-analytics";
import type { PortfolioHolding } from "@/lib/portfolio";

type PortfolioData = {
  holdings: PortfolioHolding[];
  summary: {
    invested: number;
    value: number;
    gain: number;
    gainPercent: number;
    cardCount: number;
  };
  history: Array<{ date: string; value: number; invested: number }>;
};

const emptyPortfolio: PortfolioData = {
  holdings: [],
  summary: { invested: 0, value: 0, gain: 0, gainPercent: 0, cardCount: 0 },
  history: [],
};

function PortfolioChart({
  points,
  locale,
}: {
  points: PortfolioData["history"];
  locale: "en" | "es";
}) {
  const [range, setRange] = useState<"7D" | "30D" | "3M" | "1Y">("3M");
  const [hovered, setHovered] = useState<number | null>(null);
  const days = range === "7D" ? 7 : range === "30D" ? 30 : range === "3M" ? 90 : 365;
  const visible = points.slice(-days);

  if (visible.length < 2) {
    return <div className="portfolio-empty-chart">{locale === "es" ? "El gráfico aparecerá cuando exista suficiente historial desde tu compra." : "Your chart will appear once there is enough history after your purchase."}</div>;
  }

  const width = 900;
  const height = 230;
  const top = 14;
  const bottom = 24;
  const allValues = visible.flatMap((point) => [point.value, point.invested]);
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const spread = Math.max(max - min, 0.01);
  const x = (index: number) => (index / (visible.length - 1)) * width;
  const y = (value: number) => top + (1 - (value - min) / spread) * (height - top - bottom);
  const valueLine = visible.map((point, index) => `${x(index)},${y(point.value)}`).join(" ");
  const costLine = visible.map((point, index) => `${x(index)},${y(point.invested)}`).join(" ");
  const activeIndex = hovered ?? visible.length - 1;
  const active = visible[activeIndex];
  const activeX = x(activeIndex);
  const activeY = y(active.value);
  const pnl = active.value - active.invested;

  return (
    <div className="advanced-chart">
      <div className="chart-toolbar">
        <div>
          <strong>{formatCurrency(active.value)}</strong>
          <span className={pnl >= 0 ? "up" : "down"}>{pnl >= 0 ? "+" : ""}{formatCurrency(pnl)}</span>
        </div>
        <div className="range-switch">
          {(["7D", "30D", "3M", "1Y"] as const).map((option) => <button key={option} className={range === option ? "active" : ""} onClick={() => { setRange(option); setHovered(null); }}>{option}</button>)}
        </div>
      </div>
      <div
        className="advanced-chart-plot"
        onMouseMove={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
          setHovered(Math.round(ratio * (visible.length - 1)));
        }}
        onMouseLeave={() => setHovered(null)}
      >
        <div className="chart-y-axis"><span>{formatCurrency(max)}</span><span>{formatCurrency((max + min) / 2)}</span><span>{formatCurrency(min)}</span></div>
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={locale === "es" ? "Valor de cartera frente al capital invertido" : "Portfolio value versus invested capital"}>
          <defs><linearGradient id="advancedPortfolioFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8b5cf6" stopOpacity=".3" /><stop offset="1" stopColor="#8b5cf6" stopOpacity="0" /></linearGradient></defs>
          {[0.2, 0.5, 0.8].map((position) => <line key={position} x1="0" x2={width} y1={height * position} y2={height * position} className="chart-grid-line" />)}
          <polygon points={`0,${height - bottom} ${valueLine} ${width},${height - bottom}`} fill="url(#advancedPortfolioFill)" />
          <polyline points={costLine} className="chart-cost-line" vectorEffect="non-scaling-stroke" />
          <polyline points={valueLine} className="chart-value-line" vectorEffect="non-scaling-stroke" />
          <line x1={activeX} x2={activeX} y1={top} y2={height - bottom} className="chart-cursor" vectorEffect="non-scaling-stroke" />
          <circle cx={activeX} cy={activeY} r="5" className="chart-point" vectorEffect="non-scaling-stroke" />
        </svg>
        {hovered !== null && <div className="chart-tooltip" style={{ left: `${(activeIndex / (visible.length - 1)) * 100}%` }}><strong>{formatCurrency(active.value)}</strong><span>{new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(active.date))}</span><small>{locale === "es" ? "Invertido" : "Invested"} {formatCurrency(active.invested)}</small></div>}
      </div>
      <div className="chart-legend"><span><i className="value" />{locale === "es" ? "Valor de mercado" : "Market value"}</span><span><i className="cost" />{locale === "es" ? "Capital invertido" : "Invested capital"}</span></div>
    </div>
  );
}

export default function PortfolioPage() {
  const { locale, t } = useLanguage();
  const { cardSurfaceProps } = useCardDetail();
  const [data, setData] = useState(emptyPortfolio);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [requestedCardId, setRequestedCardId] = useState("");
  const [cardQuery, setCardQuery] = useState("");
  const [results, setResults] = useState<CatalogCard[]>([]);
  const [selectedCard, setSelectedCard] = useState<CatalogCard | null>(null);
  const [saving, setSaving] = useState(false);
  const [updatingHolding, setUpdatingHolding] = useState<number | null>(null);
  const [error, setError] = useState("");
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const loadPortfolio = () =>
    fetch("/api/portfolio")
      .then((response) => response.json())
      .then((result: PortfolioData) => setData(result))
      .finally(() => setLoading(false));

  useEffect(() => {
    loadPortfolio().catch(() => setError("Unable to load portfolio"));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const cardId = params.get("cardId") ?? "";
      const search = params.get("q") ?? "";
      if (cardId || search) setShowAdd(true);
      setRequestedCardId(cardId);
      setCardQuery(search);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!requestedCardId) return;
    const controller = new AbortController();
    fetch(`/api/cards/${requestedCardId}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Card unavailable");
        return response.json();
      })
      .then((result: { card: CatalogCard }) => {
        setSelectedCard(result.card);
        setCardQuery(
          `${result.card.name} · ${result.card.setCode.toUpperCase()}`,
        );
      })
      .catch((fetchError: Error) => {
        if (fetchError.name !== "AbortError") {
          setError("Unable to prepare this card");
        }
      });
    return () => controller.abort();
  }, [requestedCardId]);

  useEffect(() => {
    if (cardQuery.trim().length < 2 || selectedCard) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/cards/search?q=${encodeURIComponent(cardQuery)}`, { signal: controller.signal })
        .then((response) => response.json())
        .then((result: { cards: CatalogCard[] }) => setResults(result.cards))
        .catch(() => setResults([]));
    }, 220);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [cardQuery, selectedCard]);

  useEffect(() => {
    if (!showAdd) return;
    const previousOverflow = document.body.style.overflow;
    const trigger = addButtonRef.current;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowAdd(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      trigger?.focus();
    };
  }, [showAdd]);

  const allocation = useMemo(
    () => {
      const grouped = new Map<string, number>();
      data.holdings.forEach((holding) =>
        grouped.set(
          holding.name,
          (grouped.get(holding.name) ?? 0) + (holding.currentValue ?? 0),
        ),
      );
      return [...grouped.entries()]
        .map(([name, value]) => ({
          name,
          value,
          share: data.summary.value > 0 ? (value / data.summary.value) * 100 : 0,
        }))
        .sort((a, b) => b.value - a.value);
    },
    [data],
  );

  const analytics = useMemo(() => {
    const valued = data.holdings.filter(
      (holding) => holding.currentValue !== null && holding.gainPercent !== null,
    );
    const ranked = [...valued].sort(
      (a, b) => (b.gainPercent ?? 0) - (a.gainPercent ?? 0),
    );
    const previous = data.history.at(-2)?.value ?? data.summary.value;
    const dailyChange = previous > 0
      ? ((data.summary.value - previous) / previous) * 100
      : 0;
    const series = calculateSeriesMetrics(
      data.history.map((point) => ({ date: point.date, value: point.value })),
    );
    const concentrationIndex = allocation.reduce(
      (total, item) => total + (item.share / 100) ** 2,
      0,
    );
    const diversificationScore = allocation.length > 1
      ? Math.max(0, Math.min(100, (1 - concentrationIndex) * 125))
      : 0;
    const returnToRisk = series && series.annualizedVolatilityPercent > 0
      ? data.summary.gainPercent / series.annualizedVolatilityPercent
      : 0;
    return {
      dailyChange,
      best: ranked[0] ?? null,
      worst: ranked.at(-1) ?? null,
      profitableShare: valued.length
        ? (valued.filter((holding) => (holding.gain ?? 0) > 0).length / valued.length) * 100
        : 0,
      concentration: allocation[0]?.share ?? 0,
      averagePosition: valued.length ? data.summary.value / valued.length : 0,
      volatility: series?.annualizedVolatilityPercent ?? 0,
      maxDrawdown: series?.maxDrawdownPercent ?? 0,
      diversificationScore,
      returnToRisk,
    };
  }, [allocation, data]);

  const displayedAllocation = useMemo(() => {
    if (allocation.length <= 5) return allocation;
    const leading = allocation.slice(0, 4);
    const other = allocation.slice(4).reduce(
      (total, item) => ({
        name: locale === "es" ? "Otros" : "Other",
        value: total.value + item.value,
        share: total.share + item.share,
      }),
      { name: locale === "es" ? "Otros" : "Other", value: 0, share: 0 },
    );
    return [...leading, other];
  }, [allocation, locale]);

  const allocationGradient = useMemo(() => {
    const colours = ["#8b5cf6", "#3b82f6", "#22c9a5", "#f1b94d", "#ef6b83"];
    const result = displayedAllocation.reduce(
      (current, item, index) => ({
        cursor: current.cursor + item.share,
        stops: [
          ...current.stops,
          `${colours[index]} ${current.cursor}% ${current.cursor + item.share}%`,
        ],
      }),
      { cursor: 0, stops: [] as string[] },
    );
    const stops = result.cursor < 100
      ? [...result.stops, `rgba(255,255,255,.06) ${result.cursor}% 100%`]
      : result.stops;
    return `conic-gradient(${stops.join(",")})`;
  }, [displayedAllocation]);

  const addHolding = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedCard) return;
    setSaving(true);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/portfolio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cardId: selectedCard.id,
        quantity: Number(form.get("quantity")),
        purchasePrice: Number(form.get("purchasePrice")),
        condition: form.get("condition"),
        language: form.get("language"),
        acquiredAt: form.get("acquiredAt"),
      }),
    });
    if (response.ok) {
      setData((await response.json()) as PortfolioData);
      setShowAdd(false);
      setSelectedCard(null);
      setCardQuery("");
    } else {
      setError("Unable to save this holding");
    }
    setSaving(false);
  };

  const removeHolding = async (id: number) => {
    const response = await fetch(`/api/portfolio/${id}`, { method: "DELETE" });
    if (response.ok) setData((await response.json()) as PortfolioData);
  };

  const updateHoldingLanguage = async (
    id: number,
    language: CardLanguage,
  ) => {
    setUpdatingHolding(id);
    setError("");
    const response = await fetch(`/api/portfolio/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language }),
    });
    if (response.ok) {
      setData((await response.json()) as PortfolioData);
    } else {
      setError(locale === "es" ? "No se pudo actualizar el idioma" : "Unable to update language");
    }
    setUpdatingHolding(null);
  };

  return (
    <main className="account-page">
      <header className="account-topbar">
        <Link href="/" className="inventory-brand"><MagicBrainLogo /></Link>
        <nav><Link href="/inventory">{t("Inventory")}</Link><Link href="/watchlist">{t("Watchlist")}</Link><Link href="/brain-pro"><Sparkles size={13} /> Brain Pro</Link></nav>
        <LanguageToggle />
        <AuthControl compact />
        <Link href="/" className="back-dashboard"><ArrowLeft size={15} /> {t("Dashboard")}</Link>
      </header>

      <div className="account-content">
        <div className="account-heading">
          <div><span className="eyebrow">{locale === "es" ? "Rendimiento personal" : "Personal performance"}</span><h1>{t("My portfolio")}</h1><p>{locale === "es" ? "Valoración en tiempo real según tus precios de compra." : "Real-time valuation based on your actual purchase prices."}</p></div>
          <button ref={addButtonRef} className="primary-button" onClick={() => setShowAdd(true)}><Plus size={16} /> {t("Add holding")}</button>
        </div>

        {loading ? (
          <div className="portfolio-loading">{locale === "es" ? "Preparando tu espacio…" : "Preparing your workspace…"}</div>
        ) : data.holdings.length === 0 ? (
          <PortfolioOnboarding onAdd={() => setShowAdd(true)} />
        ) : (
          <>
            <section className="account-metrics">
              <div><span>{t("Portfolio value")}</span><strong>{formatCurrency(data.summary.value)}</strong><em className={data.summary.gain >= 0 ? "up" : "down"}>{data.summary.gain >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}{data.summary.gainPercent.toFixed(2)}%</em></div>
              <div><span>{t("Total invested")}</span><strong>{formatCurrency(data.summary.invested)}</strong><small>{data.summary.cardCount} {locale === "es" ? "cartas" : "cards"}</small></div>
              <div><span>{t("Unrealised return")}</span><strong className={data.summary.gain >= 0 ? "up" : "down"}>{data.summary.gain >= 0 ? "+" : ""}{formatCurrency(data.summary.gain)}</strong><small>{locale === "es" ? "Desde la compra" : "Since purchase"}</small></div>
              <div><span>{locale === "es" ? "Movimiento diario" : "Daily movement"}</span><strong className={analytics.dailyChange >= 0 ? "up" : "down"}>{analytics.dailyChange >= 0 ? "+" : ""}{analytics.dailyChange.toFixed(2)}%</strong><small>{locale === "es" ? "Último cierre disponible" : "Latest available close"}</small></div>
            </section>

            <section className="portfolio-workspace">
              <div className="fintech-panel performance-panel">
                <div className="section-title"><div><span className="eyebrow">{t("Portfolio performance")}</span><h2>{locale === "es" ? "Valor frente a capital invertido" : "Value versus invested capital"}</h2></div><span className="live-badge"><i /> Live</span></div>
                <PortfolioChart points={data.history} locale={locale} />
              </div>
              <div className="fintech-panel allocation-panel">
                <span className="eyebrow">{locale === "es" ? "Exposición" : "Exposure"}</span><h2>{locale === "es" ? "Concentración" : "Allocation"}</h2>
                <div className="allocation-donut" style={{ background: allocationGradient }}><div><strong>{allocation.length}</strong><span>{locale === "es" ? "activos" : "assets"}</span></div></div>
                {displayedAllocation.map((item) => <div className="allocation-row" key={item.name}><span>{item.name}</span><b>{item.share.toFixed(1)}%</b><i><span style={{ width: `${item.share}%` }} /></i></div>)}
              </div>
            </section>

            <section className="portfolio-stat-grid">
              <article><span>{locale === "es" ? "Mejor posición" : "Best performer"}</span><strong>{analytics.best?.name ?? "—"}</strong><em className="up">{analytics.best?.gainPercent === null || !analytics.best ? "—" : `+${analytics.best.gainPercent.toFixed(1)}%`}</em></article>
              <article><span>{locale === "es" ? "Posiciones rentables" : "Profitable positions"}</span><strong>{analytics.profitableShare.toFixed(0)}%</strong><small>{locale === "es" ? "de activos valorados" : "of valued assets"}</small></article>
              <article><span>{locale === "es" ? "Mayor exposición" : "Top concentration"}</span><strong>{analytics.concentration.toFixed(1)}%</strong><small>{allocation[0]?.name ?? "—"}</small></article>
              <article><span>{locale === "es" ? "Posición media" : "Average position"}</span><strong>{formatCurrency(analytics.averagePosition)}</strong><small>{locale === "es" ? "valor por activo" : "value per asset"}</small></article>
            </section>

            <section className="fintech-panel portfolio-risk-panel">
              <div className="section-title">
                <div><span className="eyebrow">{locale === "es" ? "Diagnóstico de riesgo" : "Risk diagnostics"}</span><h2>{locale === "es" ? "Calidad de la cartera" : "Portfolio quality"}</h2></div>
                <small>{locale === "es" ? "Basado en el histórico disponible" : "Based on available history"}</small>
              </div>
              <div className="risk-metric-grid">
                <article><span>{locale === "es" ? "Volatilidad anualizada" : "Annualised volatility"}</span><strong>{analytics.volatility.toFixed(1)}%</strong><small>{locale === "es" ? "Variación histórica del valor" : "Historical variability in value"}</small></article>
                <article><span>Max drawdown</span><strong className="down">{analytics.maxDrawdown.toFixed(1)}%</strong><small>{locale === "es" ? "Mayor caída desde un máximo" : "Largest decline from a prior peak"}</small></article>
                <article><span>{locale === "es" ? "Diversificación" : "Diversification"}</span><strong>{analytics.diversificationScore.toFixed(0)}/100</strong><small>{analytics.concentration > 35 ? (locale === "es" ? "Concentración elevada" : "High concentration") : (locale === "es" ? "Exposición distribuida" : "Distributed exposure")}</small></article>
                <article><span>{locale === "es" ? "Rentabilidad / riesgo" : "Return / risk"}</span><strong className={analytics.returnToRisk >= 0 ? "up" : "down"}>{analytics.returnToRisk.toFixed(2)}×</strong><small>{locale === "es" ? "Rentabilidad frente a volatilidad" : "Return relative to volatility"}</small></article>
              </div>
            </section>

            <section className="fintech-panel holdings-table">
              <div className="section-title"><div><span className="eyebrow">{t("Your collection")}</span><h2>{locale === "es" ? "Posiciones" : "Holdings"}</h2></div><span>{data.holdings.length} {locale === "es" ? "lotes" : "lots"}</span></div>
            <div className="holdings-list">
              {data.holdings.map((holding) => <div className="portfolio-row card-surface" key={holding.id} {...cardSurfaceProps(holding.cardId)}>
                {holding.imageUrl && <img src={holding.imageUrl} alt="" />}
                <div className="holding-identity">
                  <strong>{holding.name}</strong>
                  <span>{holding.setCode.toUpperCase()} · {holding.condition.replace("_", " ")} · {holding.quantity}×</span>
                  <label className="holding-language">
                    <span>{locale === "es" ? "Idioma" : "Language"}</span>
                    <select
                      value={holding.language}
                      disabled={updatingHolding === holding.id}
                      onChange={(event) => void updateHoldingLanguage(holding.id, event.target.value as CardLanguage)}
                    >
                      {CARD_LANGUAGES.map((language) => <option key={language.code} value={language.code}>{language[locale]}</option>)}
                    </select>
                  </label>
                </div>
                <div><span>{locale === "es" ? "Coste" : "Cost"}</span><strong>{formatCurrency(holding.costBasis)}</strong></div>
                <div><span>{locale === "es" ? "Valor" : "Value"}</span><strong>{holding.currentValue === null ? "—" : formatCurrency(holding.currentValue)}</strong></div>
                <div><span>P&L</span><strong className={(holding.gain ?? 0) >= 0 ? "up" : "down"}>{holding.gain === null ? "—" : `${holding.gain >= 0 ? "+" : ""}${formatCurrency(holding.gain)}`}</strong></div>
                <button onClick={() => removeHolding(holding.id)} aria-label={`Remove ${holding.name}`}><Trash2 size={15} /></button>
              </div>)}
            </div>
            </section>
          </>
        )}
        {error && <div className="inline-error">{error}</div>}
      </div>

      {showAdd && (
        <div className="card-detail-backdrop" onMouseDown={() => setShowAdd(false)}>
          <form className="holding-form" role="dialog" aria-modal="true" aria-labelledby="holding-form-title" onSubmit={addHolding} onMouseDown={(event) => event.stopPropagation()}>
            <button ref={closeButtonRef} type="button" className="detail-close" onClick={() => setShowAdd(false)} aria-label={locale === "es" ? "Cerrar" : "Close"}><X size={18} /></button>
            <span className="eyebrow">{t("Portfolio")}</span><h2 id="holding-form-title">{t("Add holding")}</h2>
            <label>{t("Card name")}<div className="holding-card-search"><Search size={15} /><input value={cardQuery} onChange={(event) => { setCardQuery(event.target.value); setSelectedCard(null); }} placeholder="Black Lotus…" /></div></label>
            {!selectedCard && results.length > 0 && <div className="holding-results">{results.map((card) => <button type="button" key={card.id} onClick={() => { setSelectedCard(card); setCardQuery(`${card.name} · ${card.setCode.toUpperCase()}`); setResults([]); }}>{card.imageUrl && <img src={card.imageUrl} alt="" />}<span><strong>{card.name}</strong><small>{card.setName}</small></span><b>{card.price === null ? "—" : formatCurrency(card.price)}</b></button>)}</div>}
            <div className="form-grid"><label>Quantity<input name="quantity" type="number" min="1" defaultValue="1" required /></label><label>{locale === "es" ? "Precio de compra unitario" : "Unit purchase price"}<input key={selectedCard?.id ?? "no-card"} name="purchasePrice" type="number" min="0" step=".01" defaultValue={selectedCard?.price ?? ""} required /></label></div>
            <div className="form-grid"><label>Condition<select name="condition"><option value="near_mint">Near Mint</option><option value="excellent">Excellent</option><option value="good">Good</option><option value="light_played">Light Played</option></select></label><label>{locale === "es" ? "Idioma" : "Language"}<select name="language">{CARD_LANGUAGES.map((language) => <option key={language.code} value={language.code}>{language[locale]}</option>)}</select></label></div>
            <label>{locale === "es" ? "Fecha de compra" : "Purchase date"}<input name="acquiredAt" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></label>
            <button className="primary-button form-submit" disabled={!selectedCard || saving}>{saving ? "Saving…" : t("Add holding")}</button>
          </form>
        </div>
      )}
    </main>
  );
}
