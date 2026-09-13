"use client";

/* eslint-disable @next/next/no-img-element */

import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Check,
  Copy,
  FolderInput,
  Pencil,
  Plus,
  Search,
  Share2,
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
import type { PortfolioHolding, PortfolioList } from "@/lib/portfolio";
import type { PortfolioForecast } from "@/lib/portfolio-forecast-model";
import type { MlCardContext, MlRankingStatus } from "@/lib/ml-experience";
import {
  calculateOpportunityAnalytics,
  calculatePortfolioSummary,
  type PortfolioOpportunityClassification,
} from "@/lib/portfolio-model";
import styles from "./portfolio.module.css";

type PortfolioData = {
  lists: PortfolioList[];
  selectedListId: string;
  holdings: Array<PortfolioHolding & { ml?: MlCardContext | null }>;
  summary: {
    invested: number;
    value: number;
    gain: number;
    gainPercent: number;
    unrealizedGain: number;
    unrealizedGainPercent: number | null;
    valuedInvested: number;
    unpricedInvested: number;
    pricedHoldings: number;
    unpricedHoldings: number;
    zeroCostHoldings: number;
    pricingCoveragePercent: number;
    winners: number;
    losers: number;
    flat: number;
    bestContributor: {
      id: number | null;
      name: string | null;
      gain: number;
      gainPercent: number | null;
      currentValue: number;
    } | null;
    worstContributor: {
      id: number | null;
      name: string | null;
      gain: number;
      gainPercent: number | null;
      currentValue: number;
    } | null;
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
    mode: "ml" | "deterministic";
    state: "no_portfolio" | "no_priced_holdings" | "active";
    candidateState:
      | "available"
      | "no_candidates_after_constraints"
      | "portfolio_unavailable";
    candidateAdditions: Array<{
      id: string;
      name: string;
      setCode: string;
      imageUrl: string | null;
      price: number;
      change7d: number | null;
      ml?: MlCardContext | null;
    }>;
    holdingReviews: Array<
      PortfolioHolding & {
        ml?: MlCardContext | null;
        reviewSignal: "cooling" | "hold";
      }
    >;
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
  lists: [],
  selectedListId: "",
  holdings: [],
  summary: {
    invested: 0,
    value: 0,
    gain: 0,
    gainPercent: 0,
    unrealizedGain: 0,
    unrealizedGainPercent: null,
    valuedInvested: 0,
    unpricedInvested: 0,
    pricedHoldings: 0,
    unpricedHoldings: 0,
    zeroCostHoldings: 0,
    pricingCoveragePercent: 0,
    winners: 0,
    losers: 0,
    flat: 0,
    bestContributor: null,
    worstContributor: null,
    cardCount: 0,
  },
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
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={locale === "es" ? "Valor conocido de cartera frente al coste de posiciones valoradas" : "Known portfolio value versus priced holdings cost"}>
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
      <div className="chart-legend"><span><i className="value" />{locale === "es" ? "Valor conocido" : "Known value"}</span><span><i className="cost" />{locale === "es" ? "Coste valorado" : "Priced cost basis"}</span></div>
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
  const [notice, setNotice] = useState("");
  const [selectedHoldingIds, setSelectedHoldingIds] = useState<number[]>([]);
  const [bulkDestination, setBulkDestination] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [managingLists, setManagingLists] = useState(false);
  const [share, setShare] = useState<{
    id: string;
    expiresAt: string;
    active: boolean;
    url?: string;
  } | null>(null);
  const [shareNow, setShareNow] = useState(0);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const loadPortfolio = (listId?: string) =>
    fetch(`/api/portfolio${listId ? `?listId=${encodeURIComponent(listId)}` : ""}`)
      .then((response) => {
        if (!response.ok) throw new Error("Unable to load portfolio");
        return response.json();
      })
      .then((result: PortfolioData) => {
        setData(result);
        setSelectedHoldingIds([]);
        window.localStorage.setItem("portfolio.activeListId", result.selectedListId);
      })
      .finally(() => setLoading(false));

  useEffect(() => {
    loadPortfolio(window.localStorage.getItem("portfolio.activeListId") ?? undefined)
      .catch(() => loadPortfolio().catch(() => setError("Unable to load portfolio")));
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

  useEffect(() => {
    if (!managingLists || !data.selectedListId) return;
    fetch(`/api/portfolio/lists/${data.selectedListId}/shares`)
      .then((response) => response.json())
      .then((result: { shares?: Array<typeof share> }) =>
        setShare(result.shares?.find((candidate) => candidate?.active) ?? null),
      )
      .catch(() => setShare(null));
  }, [data.selectedListId, managingLists]);

  useEffect(() => {
    if (!share?.active) return;
    const timer = window.setInterval(() => setShareNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [share?.active]);

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

  const activeList = data.lists.find(
    (list) => list.id === data.selectedListId,
  );
  const otherLists = data.lists.filter(
    (list) => list.id !== data.selectedListId,
  );

  const createList = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    const response = await fetch("/api/portfolio/lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newListName }),
    });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error ?? "Unable to create list");
      return;
    }
    setNewListName("");
    setNotice(locale === "es" ? "Lista creada." : "List created.");
    await loadPortfolio(result.list.id);
  };

  const renameList = async (list: PortfolioList) => {
    const name = window.prompt(
      locale === "es" ? "Nuevo nombre de la lista" : "New list name",
      list.name,
    )?.trim();
    if (!name || name === list.name) return;
    const response = await fetch(`/api/portfolio/lists/${list.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!response.ok) {
      const result = await response.json();
      setError(result.error ?? "Unable to rename list");
      return;
    }
    setNotice(locale === "es" ? "Lista renombrada." : "List renamed.");
    await loadPortfolio(data.selectedListId);
  };

  const reorderList = async (listId: string, offset: -1 | 1) => {
    const index = data.lists.findIndex((list) => list.id === listId);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= data.lists.length) return;
    const ordered = data.lists.map((list) => list.id);
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    const response = await fetch("/api/portfolio/lists", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds: ordered }),
    });
    if (response.ok) await loadPortfolio(data.selectedListId);
    else setError(locale === "es" ? "No se pudo reordenar." : "Unable to reorder.");
  };

  const deleteList = async (list: PortfolioList) => {
    if (list.isDefault) return;
    const destination = data.lists.find((candidate) => candidate.isDefault);
    const message = list.holdingCount
      ? locale === "es"
        ? `Eliminar “${list.name}” moverá sus ${list.holdingCount} posiciones a “${destination?.name}”. ¿Continuar?`
        : `Deleting “${list.name}” will move its ${list.holdingCount} holdings to “${destination?.name}”. Continue?`
      : locale === "es"
        ? `¿Eliminar la lista vacía “${list.name}”?`
        : `Delete the empty list “${list.name}”?`;
    if (!window.confirm(message)) return;
    const response = await fetch(`/api/portfolio/lists/${list.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        list.holdingCount ? { destinationListId: destination?.id } : {},
      ),
    });
    if (!response.ok) {
      const result = await response.json();
      setError(result.error ?? "Unable to delete list");
      return;
    }
    setNotice(locale === "es" ? "Lista eliminada." : "List deleted.");
    await loadPortfolio(
      list.id === data.selectedListId ? destination?.id : data.selectedListId,
    );
  };

  const runBulkAction = async (action: "move" | "copy" | "delete") => {
    if (!selectedHoldingIds.length) return;
    if (
      action === "delete" &&
      !window.confirm(
        locale === "es"
          ? `Eliminar permanentemente ${selectedHoldingIds.length} posiciones de la cartera?`
          : `Permanently remove ${selectedHoldingIds.length} holdings from your portfolio?`,
      )
    ) return;
    if (
      action !== "delete" &&
      (!bulkDestination || bulkDestination === data.selectedListId)
    ) {
      setError(locale === "es" ? "Elige otra lista." : "Choose another list.");
      return;
    }
    setBulkBusy(true);
    setError("");
    const response = await fetch("/api/portfolio/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        holdingIds: selectedHoldingIds,
        sourceListId: data.selectedListId,
        destinationListId: action === "delete" ? undefined : bulkDestination,
        requestId: crypto.randomUUID(),
      }),
    });
    if (response.ok) {
      setNotice(
        locale === "es"
          ? action === "copy"
            ? "Posiciones copiadas; se conservan en la lista original."
            : action === "move"
              ? "Posiciones movidas a otra lista."
              : "Posiciones eliminadas de la cartera."
          : action === "copy"
            ? "Holdings copied; originals remain in this list."
            : action === "move"
              ? "Holdings moved to another list."
              : "Holdings removed from the portfolio.",
      );
      await loadPortfolio(data.selectedListId);
    } else {
      setError(locale === "es" ? "La acción masiva falló." : "Bulk action failed.");
    }
    setBulkBusy(false);
  };

  const createShare = async () => {
    if (
      share?.active &&
      !window.confirm(
        locale === "es"
          ? "Crear un enlace nuevo revocará inmediatamente el enlace activo. ¿Continuar?"
          : "Creating a new link immediately revokes the active link. Continue?",
      )
    ) return;
    const response = await fetch(
      `/api/portfolio/lists/${data.selectedListId}/shares`,
      { method: "POST" },
    );
    const result = await response.json();
    if (!response.ok) {
      setError(result.error ?? "Unable to create share link");
      return;
    }
    setShare({ ...result.share, url: result.url });
    setShareNow(Date.now());
    setNotice(
      locale === "es"
        ? "Enlace creado. Caduca exactamente 24 horas después de su creación."
        : "Link created. It expires exactly 24 hours after creation.",
    );
  };

  const revokeShare = async () => {
    if (!share || !window.confirm(
      locale === "es"
        ? "¿Revocar este enlace ahora?"
        : "Revoke this link now?",
    )) return;
    const response = await fetch(
      `/api/portfolio/lists/${data.selectedListId}/shares/${share.id}`,
      { method: "DELETE" },
    );
    if (response.ok) {
      setShare(null);
      setNotice(locale === "es" ? "Enlace revocado." : "Link revoked.");
    }
  };

  const shareCountdown = share?.active
    ? Math.max(0, new Date(share.expiresAt).getTime() - shareNow)
    : 0;
  const shareCountdownLabel = `${Math.floor(shareCountdown / 3_600_000)}h ${Math.floor((shareCountdown % 3_600_000) / 60_000)}m ${Math.floor((shareCountdown % 60_000) / 1_000)}s`;

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
        listId: data.selectedListId,
      }),
    });
    if (response.ok) {
      await loadPortfolio(data.selectedListId);
      setShowAdd(false);
      setSelectedCard(null);
      setCardQuery("");
    } else {
      setError("Unable to save this holding");
    }
    setSaving(false);
  };

  const removeHolding = async (id: number) => {
    if (!window.confirm(
      locale === "es"
        ? "¿Eliminar esta posición de la cartera? Esta acción es permanente."
        : "Remove this holding from the portfolio? This is permanent.",
    )) return;
    const response = await fetch(`/api/portfolio/${id}`, { method: "DELETE" });
    if (response.ok) await loadPortfolio(data.selectedListId);
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
      await loadPortfolio(data.selectedListId);
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
        listId: data.selectedListId,
      }),
    });
    if (response.ok) {
      trackMlFeedback({
        eventType: "add_to_portfolio",
        surface: "portfolio",
        cardId: candidate.id,
        context: candidate.ml ?? undefined,
        rankPosition,
      });
      await loadPortfolio(data.selectedListId);
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

        {!loading && data.lists.length > 0 && (
          <section className={styles.listWorkspace} aria-label={locale === "es" ? "Listas de cartera" : "Portfolio lists"}>
            <div className={styles.listSwitcher}>
              <label>
                <span>{locale === "es" ? "Lista activa" : "Active list"}</span>
                <select
                  value={data.selectedListId}
                  onChange={(event) => {
                    setLoading(true);
                    void loadPortfolio(event.target.value).catch(() =>
                      setError(locale === "es" ? "No se pudo cambiar de lista." : "Unable to switch list."),
                    );
                  }}
                >
                  {data.lists.map((list) => (
                    <option key={list.id} value={list.id}>
                      {list.name} ({list.holdingCount})
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={() => setManagingLists((value) => !value)} aria-expanded={managingLists}>
                {locale === "es" ? "Gestionar listas" : "Manage lists"}
              </button>
            </div>
            {managingLists && (
              <div className={styles.listManager}>
                <form onSubmit={createList}>
                  <label>
                    <span>{locale === "es" ? "Nueva lista" : "New list"}</span>
                    <input
                      value={newListName}
                      maxLength={80}
                      onChange={(event) => setNewListName(event.target.value)}
                      placeholder={locale === "es" ? "Por ejemplo, Modern" : "For example, Modern"}
                    />
                  </label>
                  <button className="primary-button" disabled={!newListName.trim()}>
                    <Plus size={15} /> {locale === "es" ? "Crear" : "Create"}
                  </button>
                </form>
                <div>
                  {data.lists.map((list, index) => (
                    <div className={styles.listManagerRow} key={list.id}>
                      <span><strong>{list.name}</strong><small>{list.holdingCount} {locale === "es" ? "posiciones" : "holdings"}{list.isDefault ? ` · ${locale === "es" ? "predeterminada" : "default"}` : ""}</small></span>
                      <button type="button" disabled={index === 0} onClick={() => void reorderList(list.id, -1)} aria-label={`${locale === "es" ? "Subir" : "Move up"} ${list.name}`}><ChevronUp size={15} /></button>
                      <button type="button" disabled={index === data.lists.length - 1} onClick={() => void reorderList(list.id, 1)} aria-label={`${locale === "es" ? "Bajar" : "Move down"} ${list.name}`}><ChevronDown size={15} /></button>
                      <button type="button" onClick={() => void renameList(list)} aria-label={`${locale === "es" ? "Renombrar" : "Rename"} ${list.name}`}><Pencil size={14} /></button>
                      <button type="button" disabled={list.isDefault || data.lists.length === 1} onClick={() => void deleteList(list)} aria-label={`${locale === "es" ? "Eliminar" : "Delete"} ${list.name}`}><Trash2 size={15} /></button>
                    </div>
                  ))}
                </div>
                <section className={styles.shareManager}>
                  <div>
                    <Share2 size={16} />
                    <span>
                      <strong>{locale === "es" ? `Compartir “${activeList?.name}”` : `Share “${activeList?.name}”`}</strong>
                      <small>{locale === "es" ? "Vista pública en vivo, de solo lectura y sin datos financieros privados." : "Live, public read-only view with no private financial data."}</small>
                    </span>
                  </div>
                  {share?.active ? (
                    <>
                      <p role="status">
                        {locale === "es" ? "Caduca en " : "Expires in "}
                        <strong>{shareCountdownLabel}</strong>
                        {" · "}
                        {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(share.expiresAt))}
                      </p>
                      {share.url ? (
                        <div className={styles.shareLink}>
                          <input readOnly value={share.url} aria-label={locale === "es" ? "Enlace compartido" : "Share link"} />
                          <button type="button" onClick={() => void navigator.clipboard.writeText(share.url!).then(() => setNotice(locale === "es" ? "Enlace copiado." : "Link copied."))}>{locale === "es" ? "Copiar" : "Copy"}</button>
                        </div>
                      ) : (
                        <p>{locale === "es" ? "Por seguridad, el enlace completo solo se muestra al crearlo. Puedes reemplazarlo." : "For security, the full link is shown only when created. You can replace it."}</p>
                      )}
                      <div className={styles.shareActions}>
                        <button type="button" onClick={() => void createShare()}>{locale === "es" ? "Reemplazar enlace" : "Replace link"}</button>
                        <button type="button" onClick={() => void revokeShare()}>{locale === "es" ? "Revocar ahora" : "Revoke now"}</button>
                      </div>
                    </>
                  ) : (
                    <button type="button" className={styles.createShareButton} onClick={() => void createShare()}>
                      <Share2 size={15} /> {locale === "es" ? "Crear enlace de 24 horas" : "Create 24-hour link"}
                    </button>
                  )}
                </section>
              </div>
            )}
          </section>
        )}

        {loading ? (
          <div className="portfolio-loading">{locale === "es" ? "Preparando tu espacio…" : "Preparing your workspace…"}</div>
        ) : data.holdings.length === 0 ? (
          <PortfolioOnboarding onAdd={() => setShowAdd(true)} />
        ) : (
          <>
            <section className="account-metrics">
              <div><span>{locale === "es" ? "Coste total invertido" : "Total invested cost"}</span><strong>{formatCurrency(data.summary.invested)}</strong><small>{data.summary.cardCount} {locale === "es" ? "cartas en cartera" : "cards held"}</small></div>
              <div><span>{locale === "es" ? "Valor actual conocido" : "Known current value"}</span><strong>{formatCurrency(data.summary.value)}</strong><small>{data.summary.pricedHoldings}/{data.holdings.length} {locale === "es" ? "posiciones con precio" : "holdings priced"} · {data.summary.pricingCoveragePercent.toFixed(0)}%</small></div>
              <div><span>{locale === "es" ? "Ganancia/pérdida no realizada" : "Unrealized gain/loss"}</span><strong className={data.summary.unrealizedGain >= 0 ? "up" : "down"}>{data.summary.unrealizedGain >= 0 ? <TrendingUp size={16} aria-hidden="true" /> : <TrendingDown size={16} aria-hidden="true" />}{data.summary.unrealizedGain >= 0 ? "+" : ""}{formatCurrency(data.summary.unrealizedGain)}</strong><small>{locale === "es" ? "Solo posiciones con precio actual" : "Priced holdings only"}</small></div>
              <div><span>{locale === "es" ? "Rentabilidad no realizada" : "Unrealized return"}</span><strong className={(data.summary.unrealizedGainPercent ?? 0) >= 0 ? "up" : "down"}>{data.summary.unrealizedGainPercent === null ? "—" : `${data.summary.unrealizedGainPercent >= 0 ? "▲ +" : "▼ "}${data.summary.unrealizedGainPercent.toFixed(2)}%`}</strong><small>{data.summary.unrealizedGainPercent === null ? (locale === "es" ? "No disponible: coste valorado cero" : "Unavailable: valued cost is zero") : (locale === "es" ? `Sobre ${formatCurrency(data.summary.valuedInvested)} de coste valorado` : `On ${formatCurrency(data.summary.valuedInvested)} priced cost`)}</small></div>
            </section>

            <p className={styles.pnlDisclosure}>
              {locale === "es"
                ? `Todas las cifras de rendimiento son no realizadas. Las ganancias/pérdidas realizadas requieren ventas registradas, y esta cartera todavía no tiene un registro de ventas.${data.summary.unpricedHoldings ? ` ${data.summary.unpricedHoldings} posición(es), con ${formatCurrency(data.summary.unpricedInvested)} de coste, no tienen precio actual y se excluyen del valor y P&L.` : ""}`
                : `All return figures are unrealized. Realized P&L requires recorded sales, and this portfolio does not yet have a sales ledger.${data.summary.unpricedHoldings ? ` ${data.summary.unpricedHoldings} holding(s), representing ${formatCurrency(data.summary.unpricedInvested)} of cost, have no current price and are excluded from value and P&L.` : ""}`}
            </p>

            <PortfolioForecastChart
              forecast={data.forecast}
              history={data.history}
              locale={locale}
            />

            <section className="portfolio-workspace">
              <div className="fintech-panel performance-panel">
                <div className="section-title"><div><span className="eyebrow">{t("Portfolio performance")}</span><h2>{locale === "es" ? "Valor conocido frente a coste valorado" : "Known value versus priced cost"}</h2></div><span className="live-badge"><i /> Live</span></div>
                <PortfolioChart points={data.history} locale={locale} />
              </div>
              <div className="fintech-panel allocation-panel">
                <span className="eyebrow">{locale === "es" ? "Exposición" : "Exposure"}</span><h2>{locale === "es" ? "Concentración" : "Allocation"}</h2>
                <div className="allocation-donut" style={{ background: allocationGradient }}><div><strong>{allocation.length}</strong><span>{locale === "es" ? "activos" : "assets"}</span></div></div>
                {displayedAllocation.map((item) => <div className="allocation-row" key={item.name}><span>{item.name}</span><b>{item.share.toFixed(1)}%</b><i><span style={{ width: `${item.share}%` }} /></i></div>)}
              </div>
            </section>

            <section className="portfolio-stat-grid">
              <article><span>{locale === "es" ? "Posiciones ganadoras / perdedoras" : "Winning / losing positions"}</span><strong>▲ {data.summary.winners} / ▼ {data.summary.losers}</strong><small>{data.summary.flat} {locale === "es" ? "sin cambio · solo valoradas" : "flat · priced only"}</small></article>
              <article><span>{locale === "es" ? "Mejor contribución" : "Best contributor"}</span><strong>{data.summary.bestContributor?.name ?? "—"}</strong><em className={(data.summary.bestContributor?.gain ?? 0) >= 0 ? "up" : "down"}>{data.summary.bestContributor ? `${data.summary.bestContributor.gain >= 0 ? "▲ +" : "▼ "}${formatCurrency(data.summary.bestContributor.gain)}${data.summary.bestContributor.gainPercent === null ? "" : ` · ${data.summary.bestContributor.gainPercent.toFixed(1)}%`}` : "—"}</em></article>
              <article><span>{locale === "es" ? "Peor contribución" : "Worst contributor"}</span><strong>{data.summary.worstContributor?.name ?? "—"}</strong><em className={(data.summary.worstContributor?.gain ?? 0) >= 0 ? "up" : "down"}>{data.summary.worstContributor ? `${data.summary.worstContributor.gain >= 0 ? "▲ +" : "▼ "}${formatCurrency(data.summary.worstContributor.gain)}${data.summary.worstContributor.gainPercent === null ? "" : ` · ${data.summary.worstContributor.gainPercent.toFixed(1)}%`}` : "—"}</em></article>
              <article><span>{locale === "es" ? "Mayor exposición" : "Top concentration"}</span><strong>{analytics.concentration.toFixed(1)}%</strong><small>{allocation[0]?.name ?? "—"}</small></article>
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
                  <h3>{data.mlIntelligence?.mode === "ml" ? (locale === "es" ? "Candidatas personalizadas" : "Personalized candidates") : (locale === "es" ? "Candidatas por reglas" : "Rule-based candidates")}</h3>
                  {data.mlIntelligence?.candidateAdditions.length ? data.mlIntelligence.candidateAdditions.map((candidate, index) => (
                    <article key={candidate.id} className={styles.intelligenceCard}>
                      <div>
                        <strong>{candidate.name}</strong>
                        <span>{candidate.setCode.toUpperCase()} · {formatCurrency(candidate.price)}</span>
                      </div>
                      <button type="button" onClick={() => void addCandidate(candidate, index + 1)}>
                        <Plus size={14} /> {locale === "es" ? "Revisar y añadir" : "Review and add"}
                      </button>
                      {data.mlIntelligence!.mode === "ml" && candidate.ml ? (
                        <MlInsight
                          locale={locale}
                          ranking={data.mlIntelligence!.ranking}
                          context={candidate.ml}
                          surface="portfolio"
                          cardId={candidate.id}
                          rankPosition={index + 1}
                        />
                      ) : (
                        <small className={styles.deterministicReason}>
                          {locale === "es"
                            ? `Regla transparente: precio dentro de tu límite y momentum 7D positivo (${candidate.change7d?.toFixed(1)}%).`
                            : `Transparent rule: price within your limit and positive 7D momentum (${candidate.change7d?.toFixed(1)}%).`}
                        </small>
                      )}
                    </article>
                  )) : <p>{data.mlIntelligence?.state === "no_priced_holdings"
                    ? (locale === "es" ? "Añade o actualiza precios de mercado para activar comparaciones de cartera." : "Add or refresh market prices to enable portfolio comparisons.")
                    : (locale === "es" ? "Ninguna carta pasa ahora los límites de precio, identidad y momentum. Revisa tu precio máximo o vuelve cuando cambien los datos." : "No cards currently pass the price, identity, and momentum constraints. Review your maximum price or check again when market data changes.")}</p>}
                </div>
                <div>
                  <h3>{locale === "es" ? "Posiciones para revisar" : "Holdings to review"}</h3>
                  {data.mlIntelligence?.holdingReviews.length ? data.mlIntelligence.holdingReviews.map((holding) => (
                    <article key={holding.id} className={styles.intelligenceCard}>
                      <div><strong>{holding.name}</strong><span>7D {holding.change7d === null ? "—" : `${holding.change7d >= 0 ? "+" : ""}${holding.change7d.toFixed(1)}%`} · 30D {holding.change30d === null ? "—" : `${holding.change30d >= 0 ? "+" : ""}${holding.change30d.toFixed(1)}%`}</span></div>
                      <small className={styles.deterministicReason}>
                        {holding.reviewSignal === "cooling"
                          ? (locale === "es" ? "▼ Revisar: caída de al menos 2% en 7D o 5% en 30D. No implica vender." : "▼ Review: down at least 2% over 7D or 5% over 30D. This is not a sell instruction.")
                          : (locale === "es" ? "● Mantener bajo observación: es tu mayor posición valorada y no cruza el umbral de enfriamiento." : "● Monitor: this is your largest priced position and it does not cross the cooling threshold.")}
                      </small>
                    </article>
                  )) : <p>{data.mlIntelligence?.state === "no_priced_holdings"
                    ? (locale === "es" ? "No hay posiciones con precio actual; no se puede medir momentum ni contribución." : "There are no holdings with a current price, so momentum and contribution cannot be measured.")
                    : (locale === "es" ? "No hay posiciones valoradas que revisar todavía." : "There are no priced holdings to review yet.")}</p>}
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
              <div className="section-title"><div><span className="eyebrow">{t("Your collection")}</span><h2>{locale === "es" ? "Posiciones" : "Holdings"} · {activeList?.name}</h2></div><span>{data.holdings.length} {locale === "es" ? "lotes" : "lots"}</span></div>
            <div className={styles.selectionControls}>
              <button type="button" onClick={() => setSelectedHoldingIds(data.holdings.map((holding) => holding.id))}>{locale === "es" ? "Seleccionar todo" : "Select all"}</button>
              <button type="button" disabled={!selectedHoldingIds.length} onClick={() => setSelectedHoldingIds([])}>{locale === "es" ? "Limpiar selección" : "Clear selection"}</button>
              <span role="status">{selectedHoldingIds.length} {locale === "es" ? "seleccionadas" : "selected"}</span>
            </div>
            <div className="holdings-list">
              {data.holdings.map((holding) => <div className={`portfolio-row card-surface ${styles.holdingRow} ${updatingHolding === holding.id ? styles.updating : ""}`} key={holding.id} {...cardSurfaceProps(holding.cardId)}>
                <label className={styles.selectionBox} onClick={(event) => event.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedHoldingIds.includes(holding.id)}
                    onChange={(event) =>
                      setSelectedHoldingIds((current) =>
                        event.target.checked
                          ? [...current, holding.id]
                          : current.filter((id) => id !== holding.id),
                      )
                    }
                    aria-label={`${locale === "es" ? "Seleccionar" : "Select"} ${holding.name}`}
                  />
                </label>
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
                <div><span>{locale === "es" ? "P&L no realizado" : "Unrealized P&L"}</span><strong className={(holding.gain ?? 0) >= 0 ? "up" : "down"}>{holding.gain === null ? (locale === "es" ? "Sin precio actual" : "No current price") : `${holding.gain >= 0 ? "▲ +" : "▼ "}${formatCurrency(holding.gain)}`}</strong><small className={styles.holdingReturn}>{holding.gain === null ? (locale === "es" ? "Excluido del total" : "Excluded from total") : holding.gainPercent === null ? (locale === "es" ? "% no disponible: coste cero" : "% unavailable: zero cost") : `${holding.gainPercent >= 0 ? "▲ +" : "▼ "}${holding.gainPercent.toFixed(2)}%`}</small></div>
                <div className={styles.actions}>
                  {updatingHolding === holding.id && <span className={styles.savingIndicator} role="status">{locale === "es" ? "Guardando" : "Saving"}</span>}
                  {editingHolding === holding.id ? <><button disabled={updatingHolding === holding.id} onClick={() => saveHolding(holding.id)} aria-label={`Save ${holding.name}`}><Check size={15} /></button><button disabled={updatingHolding === holding.id} onClick={() => setEditingHolding(null)} aria-label={`Cancel editing ${holding.name}`}><X size={15} /></button></> : <button onClick={() => startEditingHolding(holding)} aria-label={`Edit ${holding.name}`}><Pencil size={14} /></button>}
                  <button disabled={updatingHolding === holding.id} onClick={() => removeHolding(holding.id)} aria-label={`Remove ${holding.name}`}><Trash2 size={15} /></button>
                </div>
              </div>)}
            </div>
            </section>
            {selectedHoldingIds.length > 0 && (
              <div className={styles.bulkBar} role="region" aria-label={locale === "es" ? "Acciones masivas" : "Bulk actions"}>
                <strong>{selectedHoldingIds.length} {locale === "es" ? "seleccionadas" : "selected"}</strong>
                <select value={bulkDestination} onChange={(event) => setBulkDestination(event.target.value)} aria-label={locale === "es" ? "Lista de destino" : "Destination list"}>
                  <option value="">{locale === "es" ? "Elige destino…" : "Choose destination…"}</option>
                  {otherLists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}
                </select>
                <button type="button" disabled={bulkBusy || !bulkDestination} onClick={() => void runBulkAction("move")}><FolderInput size={15} /> {locale === "es" ? "Mover" : "Move"}</button>
                <button type="button" disabled={bulkBusy || !bulkDestination} onClick={() => void runBulkAction("copy")}><Copy size={15} /> {locale === "es" ? "Copiar" : "Copy"}</button>
                <button type="button" disabled={bulkBusy} onClick={() => void runBulkAction("delete")}><Trash2 size={15} /> {locale === "es" ? "Eliminar de cartera" : "Remove from portfolio"}</button>
              </div>
            )}
          </>
        )}
        {notice && <div className={styles.notice} role="status">{notice}</div>}
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
            <label>{locale === "es" ? "Lista de destino" : "Destination list"}<select name="listId" value={data.selectedListId} onChange={(event) => void loadPortfolio(event.target.value)}>{data.lists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}</select></label>
            <label>{locale === "es" ? "Fecha de compra" : "Purchase date"}<input name="acquiredAt" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></label>
            <button className="primary-button form-submit" disabled={!selectedCard || saving}>{saving ? "Saving…" : t("Add holding")}</button>
          </form>
        </div>
      )}
      {showImport && (
        <PortfolioImportModal
          locale={locale}
          lists={data.lists}
          selectedListId={data.selectedListId}
          onClose={() => setShowImport(false)}
          onComplete={async () => {
            setLoading(true);
            await loadPortfolio(data.selectedListId);
          }}
        />
      )}
    </main>
  );
}
