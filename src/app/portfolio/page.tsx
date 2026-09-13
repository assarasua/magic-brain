"use client";

/* eslint-disable @next/next/no-img-element */

import {
  ArrowLeft,
  Check,
  Pencil,
  Plus,
  Search,
  Trash2,
  TrendingDown,
  TrendingUp,
  Upload,
  X,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { LanguageToggle, useLanguage } from "@/components/language-provider";
import { AuthControl } from "@/components/auth-control";
import { MagicBrainLogo } from "@/components/brand-logo";
import { useCardDetail } from "@/components/card-detail-provider";
import { PortfolioOnboarding } from "@/components/portfolio-onboarding";
import { PortfolioImportModal } from "@/components/portfolio-import-modal";
import { PortfolioForecastChart } from "@/components/portfolio-forecast-chart";
import { MlInsight, trackMlFeedback } from "@/components/ml-insight";
import { CARD_LANGUAGES, type CardLanguage } from "@/lib/card-languages";
import type { CatalogCard } from "@/lib/catalog";
import { formatCurrency } from "@/lib/data";
import { calculateSeriesMetrics } from "@/lib/financial-analytics";
import type { PortfolioHolding } from "@/lib/portfolio";
import type { PortfolioForecast } from "@/lib/portfolio-forecast-model";
import type { MlCardContext, MlRankingStatus } from "@/lib/ml-experience";
import {
  calculateOpportunityAnalytics,
  calculatePortfolioSummary,
  type PortfolioOpportunityClassification,
} from "@/lib/portfolio-model";
import styles from "./portfolio.module.css";

type PortfolioData = {
  holdings: Array<PortfolioHolding & { ml?: MlCardContext | null }>;
  summary: {
    invested: number;
    value: number;
    gain: number;
    gainPercent: number;
    cardCount: number;
  };
  history: Array<{ date: string; value: number; invested: number }>;
  forecast: PortfolioForecast;
  opportunities: {
    comparableHoldings: number;
    coveragePercent: number;
    classifications: Record<
      PortfolioOpportunityClassification,
      {
        count: number;
        holdingsPercent: number;
        marketValue: number;
        exposurePercent: number;
      }
    >;
  };
  mlIntelligence?: {
    ranking: MlRankingStatus;
    candidateAdditions: Array<{
      id: string;
      name: string;
      setCode: string;
      imageUrl: string | null;
      price: number;
      change7d: number | null;
      ml: MlCardContext;
    }>;
    coolingHoldings: Array<PortfolioHolding & { ml?: MlCardContext | null }>;
  };
};

const emptyOpportunity = {
  count: 0,
  holdingsPercent: 0,
  marketValue: 0,
  exposurePercent: 0,
};

const fallbackRanking: MlRankingStatus = {
  source: "deterministic",
  reason: "scores_missing_or_stale",
  modelVersion: null,
  scoreDate: null,
};

const emptyPortfolio: PortfolioData = {
  holdings: [],
  summary: { invested: 0, value: 0, gain: 0, gainPercent: 0, cardCount: 0 },
  history: [],
  forecast: {
    asOfDate: new Date().toISOString().slice(0, 10),
    dataDate: null,
    source: "unavailable",
    modelVersion: null,
    confidence: "low",
    coverage: {
      forecastableHoldings: 0,
      totalHoldings: 0,
      projectedValuePercent: 0,
      staleCarriedHoldings: 0,
      excludedHoldings: 0,
      mlValuePercent: 0,
    },
    assumptions: {
      annualBaseRatePercent: 0,
      annualVolatilityPercent: 0,
      compoundingCapPercent: 200,
    },
    points: [],
  },
  opportunities: {
    comparableHoldings: 0,
    coveragePercent: 0,
    classifications: {
      strong_growth: emptyOpportunity,
      recovery_opportunity: emptyOpportunity,
      lost_momentum: emptyOpportunity,
    },
  },
};

const opportunityLabel = (
  classification: PortfolioOpportunityClassification | null,
  locale: "en" | "es",
) => {
  if (classification === "strong_growth") {
    return locale === "es" ? "Crecimiento fuerte" : "Strong growth";
  }
  if (classification === "recovery_opportunity") {
    return locale === "es" ? "Recuperación" : "Recovery";
  }
  if (classification === "lost_momentum") {
    return locale === "es" ? "Impulso perdido" : "Lost momentum";
  }
  return locale === "es" ? "Datos insuficientes" : "Insufficient data";
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
  const [showImport, setShowImport] = useState(false);
  const [requestedCardId, setRequestedCardId] = useState("");
  const [cardQuery, setCardQuery] = useState("");
  const [results, setResults] = useState<CatalogCard[]>([]);
  const [selectedCard, setSelectedCard] = useState<CatalogCard | null>(null);
  const [saving, setSaving] = useState(false);
  const [updatingHolding, setUpdatingHolding] = useState<number | null>(null);
  const [editingHolding, setEditingHolding] = useState<number | null>(null);
  const [editQuantity, setEditQuantity] = useState("");
  const [editPurchasePrice, setEditPurchasePrice] = useState("");
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

  const patchHolding = async (
    id: number,
    update: {
      language?: CardLanguage;
      quantity?: number;
      purchasePrice?: number;
    },
  ) => {
    const previous = data;
    setUpdatingHolding(id);
    setError("");
    setData((current) => {
      const holdings = current.holdings.map((holding) => {
        if (holding.id !== id) return holding;
        const quantity = update.quantity ?? holding.quantity;
        const purchasePrice =
          update.purchasePrice ?? holding.purchasePrice;
        const currentValue =
          holding.currentPrice === null
            ? null
            : holding.currentPrice * quantity;
        const costBasis = purchasePrice * quantity;
        const gain =
          currentValue === null ? null : currentValue - costBasis;
        const gainPercent =
          holding.currentPrice === null || purchasePrice === 0
            ? null
            : ((holding.currentPrice - purchasePrice) / purchasePrice) * 100;
        return {
          ...holding,
          ...update,
          quantity,
          purchasePrice,
          currentValue,
          costBasis,
          gain,
          gainPercent,
          returnSincePurchasePercent: gainPercent,
        };
      });
      const summary = calculatePortfolioSummary(holdings);
      return {
        ...current,
        holdings,
        summary,
        opportunities: calculateOpportunityAnalytics(
          holdings,
          summary.value,
        ),
      };
    });
    try {
      const response = await fetch(`/api/portfolio/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      });
      if (!response.ok) throw new Error("Update failed");
      setData((await response.json()) as PortfolioData);
      setEditingHolding(null);
    } catch {
      setData(previous);
      setError(
        locale === "es"
          ? "No se pudo actualizar la posición"
          : "Unable to update holding",
      );
    } finally {
      setUpdatingHolding(null);
    }
  };

  const startEditingHolding = (holding: PortfolioHolding) => {
    setEditingHolding(holding.id);
    setEditQuantity(String(holding.quantity));
    setEditPurchasePrice(holding.purchasePrice.toFixed(2));
    setError("");
  };

  const saveHolding = (id: number) => {
    const quantity = Number(editQuantity);
    const purchasePrice = Number(editPurchasePrice);
    if (
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 1_000_000 ||
      !Number.isFinite(purchasePrice) ||
      purchasePrice < 0 ||
      purchasePrice > 999_999_999_999.99 ||
      Math.abs(purchasePrice * 100 - Math.round(purchasePrice * 100)) >= 1e-7
    ) {
      setError(
        locale === "es"
          ? "Usa una cantidad entera positiva y un precio con hasta 2 decimales"
          : "Use a positive whole quantity and a price with up to 2 decimals",
      );
      return;
    }
    void patchHolding(id, { quantity, purchasePrice });
  };

  const addCandidate = async (
    candidate: NonNullable<PortfolioData["mlIntelligence"]>["candidateAdditions"][number],
    rankPosition: number,
  ) => {
    if (!window.confirm(
      locale === "es"
        ? `¿Añadir 1× ${candidate.name} a ${formatCurrency(candidate.price)} a tu cartera?`
        : `Add 1× ${candidate.name} at ${formatCurrency(candidate.price)} to your portfolio?`,
    )) return;
    const response = await fetch("/api/portfolio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cardId: candidate.id,
        quantity: 1,
        purchasePrice: candidate.price,
        condition: "near_mint",
        language: "en",
      }),
    });
    if (response.ok) {
      trackMlFeedback({
        eventType: "add_to_portfolio",
        surface: "portfolio",
        cardId: candidate.id,
        context: candidate.ml,
        rankPosition,
      });
      await loadPortfolio();
    }
  };

  return (
    <main className="account-page">
      <header className="account-topbar">
        <Link href="/" className="inventory-brand"><MagicBrainLogo /></Link>
        <nav><Link href="/inventory">{t("Inventory")}</Link><Link href="/watchlist">{t("Watchlist")}</Link><Link href="/brain">Portfolio Builder</Link></nav>
        <LanguageToggle />
        <AuthControl compact />
        <Link href="/" className="back-dashboard"><ArrowLeft size={15} /> {t("Dashboard")}</Link>
      </header>

      <div className="account-content">
        <div className="account-heading">
          <div><span className="eyebrow">{locale === "es" ? "Rendimiento personal" : "Personal performance"}</span><h1>{t("My portfolio")}</h1><p>{locale === "es" ? "Valoración en tiempo real según tus precios de compra." : "Real-time valuation based on your actual purchase prices."}</p></div>
          <div className={styles.headingActions}>
            <button className={styles.importButton} onClick={() => setShowImport(true)}><Upload size={16} /> {locale === "es" ? "Importar" : "Import"}</button>
            <button ref={addButtonRef} className="primary-button" onClick={() => setShowAdd(true)}><Plus size={16} /> {t("Add holding")}</button>
          </div>
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

            <PortfolioForecastChart
              forecast={data.forecast}
              history={data.history}
              locale={locale}
            />

            <section className="portfolio-stat-grid">
              <article><span>{locale === "es" ? "Mejor posición" : "Best performer"}</span><strong>{analytics.best?.name ?? "—"}</strong><em className="up">{analytics.best?.gainPercent === null || !analytics.best ? "—" : `+${analytics.best.gainPercent.toFixed(1)}%`}</em></article>
              <article><span>{locale === "es" ? "Posiciones rentables" : "Profitable positions"}</span><strong>{analytics.profitableShare.toFixed(0)}%</strong><small>{locale === "es" ? "de activos valorados" : "of valued assets"}</small></article>
              <article><span>{locale === "es" ? "Mayor exposición" : "Top concentration"}</span><strong>{analytics.concentration.toFixed(1)}%</strong><small>{allocation[0]?.name ?? "—"}</small></article>
              <article><span>{locale === "es" ? "Posición media" : "Average position"}</span><strong>{formatCurrency(analytics.averagePosition)}</strong><small>{locale === "es" ? "valor por activo" : "value per asset"}</small></article>
            </section>

            <section className={`fintech-panel ${styles.intelligencePanel}`}>
              <div className="section-title">
                <div>
                  <span className="eyebrow">{locale === "es" ? "INTELIGENCIA DE CARTERA" : "PORTFOLIO INTELLIGENCE"}</span>
                  <h2>{locale === "es" ? "Siguientes decisiones para revisar" : "Next decisions to review"}</h2>
                </div>
                <small>{locale === "es" ? "Sin operaciones automáticas" : "No autonomous trades"}</small>
              </div>
              <MlInsight
                locale={locale}
                ranking={data.mlIntelligence?.ranking ?? fallbackRanking}
                surface="portfolio"
              />
              {analytics.concentration > 35 && (
                <p className={styles.constraint}>
                  {locale === "es"
                    ? `Restricción: ${allocation[0]?.name} concentra el ${analytics.concentration.toFixed(1)}% de la cartera. Revisa el downside antes de aumentar esa exposición.`
                    : `Constraint: ${allocation[0]?.name} is ${analytics.concentration.toFixed(1)}% of the portfolio. Review downside before increasing that exposure.`}
                </p>
              )}
              <div className={styles.intelligenceGrid}>
                <div>
                  <h3>{locale === "es" ? "Candidatas para añadir" : "Candidate additions"}</h3>
                  {data.mlIntelligence?.candidateAdditions.length ? data.mlIntelligence.candidateAdditions.map((candidate, index) => (
                    <article key={candidate.id} className={styles.intelligenceCard}>
                      <div>
                        <strong>{candidate.name}</strong>
                        <span>{candidate.setCode.toUpperCase()} · {formatCurrency(candidate.price)}</span>
                      </div>
                      <button type="button" onClick={() => void addCandidate(candidate, index + 1)}>
                        <Plus size={14} /> {locale === "es" ? "Revisar y añadir" : "Review and add"}
                      </button>
                      <MlInsight
                        locale={locale}
                        ranking={data.mlIntelligence!.ranking}
                        context={candidate.ml}
                        surface="portfolio"
                        cardId={candidate.id}
                        rankPosition={index + 1}
                      />
                    </article>
                  )) : <p>{locale === "es" ? "No hay candidatas aprendidas verificadas disponibles." : "No verified learned candidates are available."}</p>}
                </div>
                <div>
                  <h3>{locale === "es" ? "Posiciones enfriándose" : "Cooling holdings"}</h3>
                  {data.mlIntelligence?.coolingHoldings.length ? data.mlIntelligence.coolingHoldings.map((holding, index) => (
                    <article key={holding.id} className={styles.intelligenceCard}>
                      <div><strong>{holding.name}</strong><span>7D {holding.change7d?.toFixed(1)}% · 30D {holding.change30d?.toFixed(1)}%</span></div>
                      <MlInsight
                        locale={locale}
                        ranking={data.mlIntelligence!.ranking}
                        context={holding.ml ?? undefined}
                        surface="portfolio"
                        cardId={holding.cardId}
                        rankPosition={index + 1}
                      />
                    </article>
                  )) : <p>{locale === "es" ? "Ninguna posición cruza el umbral descriptivo de enfriamiento." : "No holding crosses the descriptive cooling threshold."}</p>}
                </div>
              </div>
            </section>

            <section className={`fintech-panel ${styles.opportunityPanel}`}>
              <div className="section-title">
                <div><span className="eyebrow">{locale === "es" ? "Analítica explicable" : "Explainable analytics"}</span><h2>{locale === "es" ? "Oportunidades por impulso" : "Momentum opportunities"}</h2></div>
                <small>{data.opportunities.comparableHoldings}/{data.holdings.length} {locale === "es" ? "lotes con datos 7D y 30D" : "lots with 7D and 30D data"} · {data.opportunities.coveragePercent.toFixed(0)}%</small>
              </div>
              <p className={styles.methodology}>{locale === "es" ? "Clasificación descriptiva de precios registrados: crecimiento fuerte = 7D y 30D positivos; recuperación = 7D positivo y 30D no positivo; impulso perdido = 7D no positivo. No es una previsión." : "Descriptive classification of recorded prices: strong growth = positive 7D and 30D; recovery = positive 7D and non-positive 30D; lost momentum = non-positive 7D. This is not a forecast."}</p>
              <div className={styles.opportunityGrid}>
                {([
                  ["strong_growth", locale === "es" ? "Crecimiento fuerte" : "Strong growth"],
                  ["recovery_opportunity", locale === "es" ? "Oportunidad de recuperación" : "Recovery opportunity"],
                  ["lost_momentum", locale === "es" ? "Impulso perdido" : "Lost momentum"],
                ] as const).map(([key, label]) => {
                  const metric = data.opportunities.classifications[key];
                  return <article key={key} data-classification={key}><span>{label}</span><strong>{metric.count}</strong><small>{metric.holdingsPercent.toFixed(0)}% {locale === "es" ? "de comparables" : "of comparable lots"} · {formatCurrency(metric.marketValue)}</small><em>{metric.exposurePercent.toFixed(1)}% {locale === "es" ? "de exposición" : "portfolio exposure"}</em></article>;
                })}
              </div>
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
              {data.holdings.map((holding) => <div className={`portfolio-row card-surface ${styles.holdingRow} ${updatingHolding === holding.id ? styles.updating : ""}`} key={holding.id} {...cardSurfaceProps(holding.cardId)}>
                {holding.imageUrl && <img src={holding.imageUrl} alt="" />}
                <div className="holding-identity">
                  <strong>{holding.name}</strong>
                  <span>{holding.setCode.toUpperCase()} · {holding.condition.replace("_", " ")} · {holding.quantity}×</span>
                  <span className={styles.momentum}>
                    7D {holding.change7d === null ? "—" : `${holding.change7d >= 0 ? "+" : ""}${holding.change7d.toFixed(1)}%`}
                    {" · "}30D {holding.change30d === null ? "—" : `${holding.change30d >= 0 ? "+" : ""}${holding.change30d.toFixed(1)}%`}
                    {" · "}{locale === "es" ? "Desde compra" : "Since purchase"} {holding.returnSincePurchasePercent === null ? "—" : `${holding.returnSincePurchasePercent >= 0 ? "+" : ""}${holding.returnSincePurchasePercent.toFixed(1)}%`}
                    {" · "}{opportunityLabel(holding.opportunityClassification, locale)}
                  </span>
                  <label className="holding-language">
                    <span>{locale === "es" ? "Idioma" : "Language"}</span>
                    <select
                      value={holding.language}
                      disabled={updatingHolding === holding.id}
                      onChange={(event) => void patchHolding(holding.id, { language: event.target.value as CardLanguage })}
                    >
                      {CARD_LANGUAGES.map((language) => <option key={language.code} value={language.code}>{language[locale]}</option>)}
                    </select>
                  </label>
                </div>
                <div className={styles.costCell}><span>{locale === "es" ? "Coste" : "Cost"}</span>{editingHolding === holding.id ? <div className={styles.editFields}><label><span>{locale === "es" ? "Cantidad" : "Quantity"}</span><input aria-label={locale === "es" ? "Cantidad" : "Quantity"} type="number" min="1" max="1000000" step="1" value={editQuantity} disabled={updatingHolding === holding.id} onChange={(event) => setEditQuantity(event.target.value)} /></label><label><span>{locale === "es" ? "Precio unitario" : "Unit price"}</span><input aria-label={locale === "es" ? "Precio unitario" : "Unit price"} type="number" min="0" max="999999999999.99" step=".01" value={editPurchasePrice} disabled={updatingHolding === holding.id} onChange={(event) => setEditPurchasePrice(event.target.value)} /></label></div> : <strong>{formatCurrency(holding.costBasis)}</strong>}</div>
                <div><span>{locale === "es" ? "Valor" : "Value"}</span><strong>{holding.currentValue === null ? "—" : formatCurrency(holding.currentValue)}</strong></div>
                <div><span>P&L</span><strong className={(holding.gain ?? 0) >= 0 ? "up" : "down"}>{holding.gain === null ? "—" : `${holding.gain >= 0 ? "+" : ""}${formatCurrency(holding.gain)}`}</strong></div>
                <div className={styles.actions}>
                  {updatingHolding === holding.id && <span className={styles.savingIndicator} role="status">{locale === "es" ? "Guardando" : "Saving"}</span>}
                  {editingHolding === holding.id ? <><button disabled={updatingHolding === holding.id} onClick={() => saveHolding(holding.id)} aria-label={`Save ${holding.name}`}><Check size={15} /></button><button disabled={updatingHolding === holding.id} onClick={() => setEditingHolding(null)} aria-label={`Cancel editing ${holding.name}`}><X size={15} /></button></> : <button onClick={() => startEditingHolding(holding)} aria-label={`Edit ${holding.name}`}><Pencil size={14} /></button>}
                  <button disabled={updatingHolding === holding.id} onClick={() => removeHolding(holding.id)} aria-label={`Remove ${holding.name}`}><Trash2 size={15} /></button>
                </div>
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
      {showImport && (
        <PortfolioImportModal
          locale={locale}
          onClose={() => setShowImport(false)}
          onComplete={async () => {
            setLoading(true);
            await loadPortfolio();
          }}
        />
      )}
    </main>
  );
}
