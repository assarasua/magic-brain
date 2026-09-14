"use client";

/* eslint-disable @next/next/no-img-element */

import {
  ArrowLeft,
  Banknote,
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
import { trackMlFeedback } from "@/components/ml-insight";
import {
  PortfolioDecisionSection,
  type DecisionCandidate,
  type DecisionHolding,
} from "@/components/portfolio-decision-section";
import {
  BulkActionDialog,
  ConfirmationDialog,
  RecordSaleDialog,
} from "@/components/portfolio-action-dialog";
import { CARD_LANGUAGES, type CardLanguage } from "@/lib/card-languages";
import type { CatalogCard } from "@/lib/catalog";
import { formatCurrency } from "@/lib/data";
import { calculateSeriesMetrics } from "@/lib/financial-analytics";
import type { PortfolioHolding, PortfolioList, PortfolioSale } from "@/lib/portfolio";
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
  recentSales: PortfolioSale[];
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
    realizedProceeds: number;
    realizedCostBasis: number;
    realizedPnl: number;
    saleCount: number;
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
      setName?: string;
      collectorNumber?: string;
      imageUrl: string | null;
      price: number;
      priceDate?: string | null;
      change7d: number | null;
      change30d?: number | null;
      ml?: MlCardContext | null;
    }>;
    holdingReviews: Array<
      PortfolioHolding & {
        ml?: MlCardContext | null;
        reviewSignal: "cooling";
      }
    >;
    coverage?: {
      pricedHoldings: number;
      totalHoldings: number;
      momentumHoldings: number;
    };
    thresholds?: {
      minimumCandidatePrice: number;
      maximumCandidatePrice: number;
      cooling7dPercent: number;
      cooling30dPercent: number;
    };
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
  recentSales: [],
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
    realizedProceeds: 0,
    realizedCostBasis: 0,
    realizedPnl: 0,
    saleCount: 0,
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
  const [addDestinationListId, setAddDestinationListId] = useState("");
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
  const [portfolioLoadError, setPortfolioLoadError] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedHoldingIds, setSelectedHoldingIds] = useState<number[]>([]);
  const [bulkDestination, setBulkDestination] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkAction, setBulkAction] = useState<
    "move" | "copy" | "delete" | null
  >(null);
  const [bulkError, setBulkError] = useState("");
  const [bulkRequestId, setBulkRequestId] = useState("");
  const [newListName, setNewListName] = useState("");
  const [managingLists, setManagingLists] = useState(false);
  const [listBusy, setListBusy] = useState(false);
  const [switchingListId, setSwitchingListId] = useState("");
  const [editingListId, setEditingListId] = useState("");
  const [editingListName, setEditingListName] = useState("");
  const [confirmation, setConfirmation] = useState<
    | { kind: "holding"; id: number; name: string }
    | { kind: "list"; list: PortfolioList }
    | { kind: "share_replace" }
    | { kind: "share_revoke" }
    | null
  >(null);
  const [confirmationBusy, setConfirmationBusy] = useState(false);
  const [saleHolding, setSaleHolding] = useState<PortfolioHolding | null>(null);
  const [saleBusy, setSaleBusy] = useState(false);
  const [saleError, setSaleError] = useState("");
  const [saleRequestId, setSaleRequestId] = useState("");
  const [share, setShare] = useState<{
    id: string;
    expiresAt: string;
    active: boolean;
    url?: string;
  } | null>(null);
  const [shareNow, setShareNow] = useState(0);
  const bulkSubmittingRef = useRef(false);
  const confirmationSubmittingRef = useRef(false);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const loadPortfolio = (
    listId?: string,
    options?: { preserveSelection?: boolean },
  ) =>
    fetch(`/api/portfolio${listId ? `?listId=${encodeURIComponent(listId)}` : ""}`)
      .then((response) => {
        if (!response.ok) throw new Error("Unable to load portfolio");
        return response.json();
      })
      .then((result: PortfolioData) => {
        setData(result);
        setPortfolioLoadError(false);
        if (!options?.preserveSelection) setSelectedHoldingIds([]);
        window.localStorage.setItem("portfolio.activeListId", result.selectedListId);
      })
      .finally(() => setLoading(false));

  useEffect(() => {
    loadPortfolio(window.localStorage.getItem("portfolio.activeListId") ?? undefined)
      .catch(() => loadPortfolio().catch(() => {
        setPortfolioLoadError(true);
        setError("Unable to load portfolio");
      }));
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
    if (listBusy) return;
    setListBusy(true);
    setError("");
    try {
      const response = await fetch("/api/portfolio/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newListName }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to create list");
      setNewListName("");
      setNotice(locale === "es" ? "Lista creada." : "List created.");
      await loadPortfolio(result.list.id);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create list");
    } finally {
      setListBusy(false);
    }
  };

  const renameList = async (listId: string) => {
    const name = editingListName.trim();
    if (!name || listBusy) return;
    setListBusy(true);
    try {
      const response = await fetch(`/api/portfolio/lists/${listId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to rename list");
      setEditingListId("");
      setEditingListName("");
      setNotice(locale === "es" ? "Lista renombrada." : "List renamed.");
      await loadPortfolio(data.selectedListId);
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : "Unable to rename list");
    } finally {
      setListBusy(false);
    }
  };

  const reorderList = async (listId: string, offset: -1 | 1) => {
    if (listBusy) return;
    const index = data.lists.findIndex((list) => list.id === listId);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= data.lists.length) return;
    const ordered = data.lists.map((list) => list.id);
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    setListBusy(true);
    try {
      const response = await fetch("/api/portfolio/lists", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: ordered }),
      });
      if (!response.ok) throw new Error("reorder_failed");
      await loadPortfolio(data.selectedListId);
    } catch {
      setError(locale === "es" ? "No se pudo reordenar." : "Unable to reorder.");
    } finally {
      setListBusy(false);
    }
  };

  const deleteList = async (list: PortfolioList) => {
    if (list.isDefault || confirmationSubmittingRef.current) return;
    confirmationSubmittingRef.current = true;
    const destination = data.lists.find((candidate) => candidate.isDefault);
    setConfirmationBusy(true);
    try {
      const response = await fetch(`/api/portfolio/lists/${list.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destinationListId: destination?.id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to delete list");
      setConfirmation(null);
      setNotice(locale === "es" ? "Lista eliminada." : "List deleted.");
      await loadPortfolio(
        list.id === data.selectedListId ? destination?.id : data.selectedListId,
      );
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : locale === "es" ? "No se pudo eliminar la lista." : "Unable to delete list.",
      );
    } finally {
      setConfirmationBusy(false);
      confirmationSubmittingRef.current = false;
    }
  };

  const runBulkAction = async () => {
    const action = bulkAction;
    if (
      !action ||
      !selectedHoldingIds.length ||
      !bulkRequestId ||
      bulkBusy ||
      bulkSubmittingRef.current
    ) return;
    if (
      action !== "delete" &&
      (!bulkDestination || bulkDestination === data.selectedListId)
    ) {
      setBulkError(locale === "es" ? "Elige otra lista." : "Choose another list.");
      return;
    }
    bulkSubmittingRef.current = true;
    setBulkBusy(true);
    setBulkError("");
    try {
      const response = await fetch("/api/portfolio/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          holdingIds: selectedHoldingIds,
          sourceListId: data.selectedListId,
          destinationListId: action === "delete" ? undefined : bulkDestination,
          requestId: bulkRequestId,
        }),
      });
      const result = await response.json().catch(() => ({
        code: "invalid_response",
        error: "Invalid server response",
      }));
      if (!response.ok) {
        const localized: Record<string, string> = {
          invalid_bulk_request:
            locale === "es"
              ? "La selección ya no es válida. Selecciona entre 1 y 200 posiciones."
              : "The selection is no longer valid. Select between 1 and 200 holdings.",
          destination_missing:
            locale === "es"
              ? "La lista de destino ya no existe. Elige otra."
              : "The destination list no longer exists. Choose another.",
          invalid_destination:
            locale === "es"
              ? "Elige una lista distinta de la lista actual."
              : "Choose a list other than the current list.",
          holdings_missing:
            locale === "es"
              ? "Alguna posición cambió en otra pestaña. Actualiza la cartera y vuelve a seleccionarla."
              : "A holding changed in another tab. Refresh the portfolio and select it again.",
          bulk_operation_failed:
            locale === "es"
              ? "No se aplicó ningún cambio. Inténtalo de nuevo."
              : "No changes were applied. Try again.",
          source_list_missing:
            locale === "es"
              ? "La lista actual ya no existe. Actualiza la cartera."
              : "The current list no longer exists. Refresh the portfolio.",
          authentication_required:
            locale === "es"
              ? "Tu sesión caducó. Vuelve a iniciar sesión."
              : "Your session expired. Sign in again.",
        };
        if (result.code === "destination_missing") {
          setBulkDestination("");
          setData((current) => ({
            ...current,
            lists: current.lists.filter((list) => list.id !== bulkDestination),
          }));
        }
        setBulkError(
          localized[result.code] ??
            result.error ??
            (locale === "es"
              ? "No se aplicó ningún cambio."
              : "No changes were applied."),
        );
        return;
      }
      const affected = Number(result.affected) || 0;
      const skipped = Number(result.skipped) || 0;
      setNotice(
        locale === "es"
          ? action === "copy"
            ? `${affected} posiciones copiadas; ${skipped} omitidas. Los originales permanecen en esta lista.`
            : action === "move"
              ? `${affected} posiciones movidas; ${skipped} omitidas.`
              : `${affected} posiciones eliminadas de la cartera; ${skipped} omitidas.`
          : action === "copy"
            ? `${affected} holdings copied; ${skipped} skipped. Originals remain in this list.`
            : action === "move"
              ? `${affected} holdings moved; ${skipped} skipped.`
              : `${affected} holdings removed from the portfolio; ${skipped} skipped.`,
      );
      await loadPortfolio(data.selectedListId);
      setBulkAction(null);
      setBulkDestination("");
      setBulkRequestId("");
    } catch {
      setBulkError(
        locale === "es"
          ? "No hay conexión. Tu selección se conserva para volver a intentarlo."
          : "You appear offline. Your selection is preserved so you can retry.",
      );
    } finally {
      setBulkBusy(false);
      bulkSubmittingRef.current = false;
    }
  };

  const createShare = async () => {
    if (confirmationSubmittingRef.current) return;
    confirmationSubmittingRef.current = true;
    setConfirmationBusy(true);
    try {
      const response = await fetch(
        `/api/portfolio/lists/${data.selectedListId}/shares`,
        { method: "POST" },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to create share link");
      setShare({ ...result.share, url: result.url });
      setConfirmation(null);
      setShareNow(Date.now());
      setNotice(
        locale === "es"
          ? "Enlace creado. Caduca exactamente 24 horas después de su creación."
          : "Link created. It expires exactly 24 hours after creation.",
      );
    } catch (shareError) {
      setError(
        shareError instanceof Error
          ? shareError.message
          : locale === "es" ? "No se pudo crear el enlace." : "Unable to create share link.",
      );
    } finally {
      setConfirmationBusy(false);
      confirmationSubmittingRef.current = false;
    }
  };

  const revokeShare = async () => {
    if (!share || confirmationSubmittingRef.current) return;
    confirmationSubmittingRef.current = true;
    setConfirmationBusy(true);
    try {
      const response = await fetch(
        `/api/portfolio/lists/${data.selectedListId}/shares/${share.id}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error("revoke_failed");
      setShare(null);
      setConfirmation(null);
      setNotice(locale === "es" ? "Enlace revocado." : "Link revoked.");
    } catch {
      setError(locale === "es" ? "No se pudo revocar el enlace." : "Unable to revoke link.");
    } finally {
      setConfirmationBusy(false);
      confirmationSubmittingRef.current = false;
    }
  };

  const shareCountdown = share?.active
    ? Math.max(0, new Date(share.expiresAt).getTime() - shareNow)
    : 0;
  const shareCountdownLabel = `${Math.floor(shareCountdown / 3_600_000)}h ${Math.floor((shareCountdown % 3_600_000) / 60_000)}m ${Math.floor((shareCountdown % 60_000) / 1_000)}s`;
  const confirmationCopy = (() => {
    if (!confirmation) return { title: "", description: "", label: "" };
    if (confirmation.kind === "list") {
      return {
        title: locale === "es" ? "Eliminar lista" : "Delete list",
        description:
          confirmation.list.holdingCount > 0 || confirmation.list.saleCount > 0
          ? locale === "es"
            ? `Las ${confirmation.list.holdingCount} posiciones y ${confirmation.list.saleCount} ventas de “${confirmation.list.name}” se moverán a “${data.lists.find((list) => list.isDefault)?.name}” antes de eliminar la lista.`
            : `${confirmation.list.holdingCount} holdings and ${confirmation.list.saleCount} sales in “${confirmation.list.name}” will move to “${data.lists.find((list) => list.isDefault)?.name}” before the list is deleted.`
          : locale === "es"
            ? `La lista vacía “${confirmation.list.name}” se eliminará.`
            : `The empty list “${confirmation.list.name}” will be deleted.`,
        label: locale === "es" ? "Eliminar lista" : "Delete list",
      };
    }
    if (confirmation.kind === "holding") {
      return {
        title: locale === "es" ? "Eliminar posición" : "Remove holding",
        description: locale === "es"
          ? `“${confirmation.name}” se eliminará permanentemente de “${activeList?.name}”.`
          : `“${confirmation.name}” will be permanently removed from “${activeList?.name}”.`,
        label: locale === "es" ? "Eliminar posición" : "Remove holding",
      };
    }
    if (confirmation.kind === "share_replace") {
      return {
        title: locale === "es" ? "Reemplazar enlace" : "Replace share link",
        description: locale === "es"
          ? "El enlace actual dejará de funcionar inmediatamente. El nuevo enlace caducará 24 horas después de crearse."
          : "The current link will stop working immediately. The new link will expire 24 hours after creation.",
        label: locale === "es" ? "Reemplazar" : "Replace",
      };
    }
    return {
      title: locale === "es" ? "Revocar enlace" : "Revoke share link",
      description: locale === "es"
        ? "El enlace dejará de funcionar inmediatamente."
        : "The link will stop working immediately.",
      label: locale === "es" ? "Revocar" : "Revoke",
    };
  })();

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
        listId: addDestinationListId || data.selectedListId,
      }),
    });
    if (response.ok) {
      await loadPortfolio(addDestinationListId || data.selectedListId);
      setShowAdd(false);
      setSelectedCard(null);
      setCardQuery("");
    } else {
      setError("Unable to save this holding");
    }
    setSaving(false);
  };

  const removeHolding = async (id: number) => {
    if (confirmationSubmittingRef.current) return;
    confirmationSubmittingRef.current = true;
    setConfirmationBusy(true);
    try {
      const response = await fetch(`/api/portfolio/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("remove_failed");
      setConfirmation(null);
      setNotice(locale === "es" ? "Posición eliminada." : "Holding removed.");
      await loadPortfolio(data.selectedListId);
    } catch {
      setError(
        locale === "es"
          ? "No se eliminó la posición. Actualiza e inténtalo de nuevo."
          : "The holding was not removed. Refresh and try again.",
      );
    } finally {
      setConfirmationBusy(false);
      confirmationSubmittingRef.current = false;
    }
  };

  const recordSale = async (input: {
    quantity: number;
    saleUnitPrice: number;
    soldAt: string;
  }) => {
    if (!saleHolding || saleBusy || !saleRequestId) return;
    setSaleBusy(true);
    setSaleError("");
    try {
      const response = await fetch(`/api/portfolio/${saleHolding.id}/sales`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...input,
          listId: data.selectedListId,
          requestId: saleRequestId,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const messages: Record<string, string> = {
          holding_missing:
            locale === "es"
              ? "La posición ya no existe en esta lista."
              : "The holding is no longer in this list.",
          insufficient_quantity:
            locale === "es"
              ? `Solo quedan ${result.availableQuantity ?? 0} unidades.`
              : `Only ${result.availableQuantity ?? 0} units remain.`,
          sale_before_purchase:
            locale === "es"
              ? "La fecha de venta no puede ser anterior a la compra."
              : "The sale date cannot be before the purchase date.",
          idempotency_conflict:
            locale === "es"
              ? "Esta solicitud ya se usó para otra venta."
              : "This request was already used for another sale.",
        };
        throw new Error(
          messages[result.code] ??
            (locale === "es"
              ? "No se pudo registrar la venta."
              : "Unable to record the sale."),
        );
      }
      setSaleHolding(null);
      setSaleRequestId("");
      setNotice(
        locale === "es"
          ? "Venta registrada y posición actualizada."
          : "Sale recorded and holding updated.",
      );
      await loadPortfolio(data.selectedListId);
    } catch (saleFailure) {
      setSaleError(
        saleFailure instanceof Error
          ? saleFailure.message
          : locale === "es"
            ? "No se pudo registrar la venta."
            : "Unable to record the sale.",
      );
    } finally {
      setSaleBusy(false);
    }
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
        summary: {
          ...current.summary,
          ...summary,
        },
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
    destinationListId = data.selectedListId,
  ) => {
    const destinationName =
      data.lists.find((list) => list.id === destinationListId)?.name ??
      activeList?.name ??
      "";
    if (!window.confirm(
      locale === "es"
        ? `¿Añadir 1× ${candidate.name} a ${formatCurrency(candidate.price)} en “${destinationName}”?`
        : `Add 1× ${candidate.name} at ${formatCurrency(candidate.price)} to “${destinationName}”?`,
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
        listId: destinationListId,
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
      setNotice(
        locale === "es"
          ? `${candidate.name} añadida a “${destinationName}”.`
          : `${candidate.name} added to “${destinationName}”.`,
      );
      await loadPortfolio(data.selectedListId);
    } else {
      setError(
        locale === "es"
          ? "No se pudo añadir la candidata. Inténtalo de nuevo."
          : "The candidate could not be added. Try again.",
      );
    }
  };

  const watchCandidate = async (candidate: DecisionCandidate) => {
    const response = await fetch("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: candidate.id }),
    });
    setNotice(
      response.ok
        ? locale === "es"
          ? `${candidate.name} añadida a seguimiento. Configura alertas desde Seguimiento.`
          : `${candidate.name} added to Watchlist. Configure alerts from Watchlist.`
        : locale === "es"
          ? "No se pudo actualizar el seguimiento."
          : "Unable to update Watchlist.",
    );
  };

  const editDecisionHolding = (holding: DecisionHolding) => {
    startEditingHolding(holding);
    window.setTimeout(() => {
      document.getElementById(`holding-${holding.id}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 0);
  };

  const manageDecisionHolding = (
    holding: DecisionHolding,
    action: "move" | "copy",
  ) => {
    setSelectedHoldingIds([holding.id]);
    setBulkError("");
    setBulkDestination("");
    setBulkRequestId(crypto.randomUUID());
    setBulkAction(action);
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
        {notice && <div className={styles.notice} role="status" aria-live="polite">{notice}</div>}
        {error && <div className="inline-error" role="alert">{error}</div>}

        {!loading && data.lists.length > 0 && (
          <section className={styles.listWorkspace} aria-busy={Boolean(switchingListId)} aria-label={locale === "es" ? "Listas de cartera" : "Portfolio lists"}>
            <div className={styles.listSwitcher}>
              <div>
                <span className={styles.listLabel}>{locale === "es" ? "Tus listas" : "Your lists"}</span>
                <div className={styles.listTabs} aria-label={locale === "es" ? "Seleccionar lista" : "Choose a list"}>
                  {data.lists.map((list) => (
                    <button
                      type="button"
                      key={list.id}
                      aria-current={list.id === data.selectedListId ? "true" : undefined}
                      disabled={Boolean(switchingListId)}
                      onClick={() => {
                        if (list.id === data.selectedListId) return;
                        setSwitchingListId(list.id);
                        void loadPortfolio(list.id)
                          .catch(() =>
                            setError(locale === "es" ? "No se pudo cambiar de lista." : "Unable to switch list."),
                          )
                          .finally(() => setSwitchingListId(""));
                  }}
                    >
                      <span>{list.name}</span><small>{switchingListId === list.id ? "…" : list.holdingCount}</small>
                    </button>
                  ))}
                </div>
              </div>
              <button type="button" onClick={() => setManagingLists((value) => !value)} aria-expanded={managingLists}>
                {managingLists ? (locale === "es" ? "Cerrar" : "Done") : (locale === "es" ? "Organizar" : "Organize")}
              </button>
            </div>
            {managingLists && (
              <div className={styles.listManager} aria-label={locale === "es" ? "Organizar listas" : "Organize lists"}>
                <div className={styles.managerIntro}>
                  <strong>{locale === "es" ? "Organiza tus listas" : "Organize your lists"}</strong>
                  <span>{locale === "es" ? "Crea, renombra, ordena y comparte. La lista predeterminada no se puede eliminar." : "Create, rename, reorder, and share. The default list cannot be deleted."}</span>
                </div>
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
                  <button className="primary-button" disabled={!newListName.trim() || listBusy}>
                    <Plus size={15} /> {listBusy ? (locale === "es" ? "Guardando…" : "Saving…") : (locale === "es" ? "Crear" : "Create")}
                  </button>
                </form>
                <div>
                  {data.lists.map((list, index) => (
                    <div className={styles.listManagerRow} key={list.id}>
                      {editingListId === list.id ? (
                        <label className={styles.inlineRename}>
                          <span className="sr-only">{locale === "es" ? "Nombre de lista" : "List name"}</span>
                          <input
                            autoFocus
                            value={editingListName}
                            maxLength={80}
                            onChange={(event) => setEditingListName(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Escape") setEditingListId("");
                            }}
                          />
                        </label>
                      ) : (
                        <span><strong>{list.name}</strong><small>{list.holdingCount} {locale === "es" ? "posiciones" : "holdings"}{list.isDefault ? ` · ${locale === "es" ? "predeterminada" : "default"}` : ""}</small></span>
                      )}
                      <button type="button" disabled={listBusy || index === 0} onClick={() => void reorderList(list.id, -1)} aria-label={`${locale === "es" ? "Subir" : "Move up"} ${list.name}`}><ChevronUp size={15} /></button>
                      <button type="button" disabled={listBusy || index === data.lists.length - 1} onClick={() => void reorderList(list.id, 1)} aria-label={`${locale === "es" ? "Bajar" : "Move down"} ${list.name}`}><ChevronDown size={15} /></button>
                      {editingListId === list.id ? (
                        <>
                          <button type="button" disabled={listBusy || !editingListName.trim()} onClick={() => void renameList(list.id)} aria-label={`${locale === "es" ? "Guardar" : "Save"} ${list.name}`}><Check size={15} /></button>
                          <button type="button" disabled={listBusy} onClick={() => setEditingListId("")} aria-label={locale === "es" ? "Cancelar cambio de nombre" : "Cancel rename"}><X size={15} /></button>
                        </>
                      ) : (
                        <button type="button" onClick={() => { setEditingListId(list.id); setEditingListName(list.name); }} aria-label={`${locale === "es" ? "Renombrar" : "Rename"} ${list.name}`}><Pencil size={14} /></button>
                      )}
                      <button type="button" disabled={listBusy || list.isDefault || data.lists.length === 1} onClick={() => setConfirmation({ kind: "list", list })} aria-label={`${locale === "es" ? "Eliminar" : "Delete"} ${list.name}`}><Trash2 size={15} /></button>
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
                        <button type="button" onClick={() => setConfirmation({ kind: "share_replace" })}>{locale === "es" ? "Reemplazar enlace" : "Replace link"}</button>
                        <button type="button" onClick={() => setConfirmation({ kind: "share_revoke" })}>{locale === "es" ? "Revocar ahora" : "Revoke now"}</button>
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
          <>
            <div className="portfolio-loading">{locale === "es" ? "Preparando tu espacio…" : "Preparing your workspace…"}</div>
            <PortfolioDecisionSection
              locale={locale}
              data={{
                ranking: fallbackRanking,
                mode: "deterministic",
                state: "no_portfolio",
                candidateState: "portfolio_unavailable",
                candidateAdditions: [],
                holdingReviews: [],
              }}
              lists={[]}
              activeListId=""
              portfolioValue={0}
              selectedHoldingIds={[]}
              loading
              onAddCandidate={() => undefined}
              onWatchCandidate={() => undefined}
              onEditHolding={() => undefined}
              onManageHolding={() => undefined}
              onToggleHolding={() => undefined}
            />
          </>
        ) : data.holdings.length === 0 && data.recentSales.length === 0 ? (
          <>
            <PortfolioOnboarding onAdd={() => setShowAdd(true)} />
            <PortfolioDecisionSection
              locale={locale}
              data={data.mlIntelligence ?? {
                ranking: fallbackRanking,
                mode: "deterministic",
                state: "no_portfolio",
                candidateState: "portfolio_unavailable",
                candidateAdditions: [],
                holdingReviews: [],
              }}
              lists={data.lists}
              activeListId={data.selectedListId}
              portfolioValue={data.summary.value}
              selectedHoldingIds={[]}
              error={portfolioLoadError}
              onAddCandidate={(candidate, rank, listId) => void addCandidate(candidate, rank, listId)}
              onWatchCandidate={(candidate) => void watchCandidate(candidate)}
              onEditHolding={() => undefined}
              onManageHolding={() => undefined}
              onToggleHolding={() => undefined}
            />
          </>
        ) : (
          <>
            <section className="account-metrics">
              <div><span>{locale === "es" ? "Coste total invertido" : "Total invested cost"}</span><strong>{formatCurrency(data.summary.invested)}</strong><small>{data.summary.cardCount} {locale === "es" ? "cartas en cartera" : "cards held"}</small></div>
              <div><span>{locale === "es" ? "Valor actual conocido" : "Known current value"}</span><strong>{formatCurrency(data.summary.value)}</strong><small>{data.summary.pricedHoldings}/{data.holdings.length} {locale === "es" ? "posiciones con precio" : "holdings priced"} · {data.summary.pricingCoveragePercent.toFixed(0)}%</small></div>
              <div><span>{locale === "es" ? "Ganancia/pérdida no realizada" : "Unrealized gain/loss"}</span><strong className={data.summary.unrealizedGain >= 0 ? "up" : "down"}>{data.summary.unrealizedGain >= 0 ? <TrendingUp size={16} aria-hidden="true" /> : <TrendingDown size={16} aria-hidden="true" />}{data.summary.unrealizedGain >= 0 ? "+" : ""}{formatCurrency(data.summary.unrealizedGain)}</strong><small>{locale === "es" ? "Solo posiciones con precio actual" : "Priced holdings only"}</small></div>
              <div><span>{locale === "es" ? "Rentabilidad no realizada" : "Unrealized return"}</span><strong className={(data.summary.unrealizedGainPercent ?? 0) >= 0 ? "up" : "down"}>{data.summary.unrealizedGainPercent === null ? "—" : `${data.summary.unrealizedGainPercent >= 0 ? "▲ +" : "▼ "}${data.summary.unrealizedGainPercent.toFixed(2)}%`}</strong><small>{data.summary.unrealizedGainPercent === null ? (locale === "es" ? "No disponible: coste valorado cero" : "Unavailable: valued cost is zero") : (locale === "es" ? `Sobre ${formatCurrency(data.summary.valuedInvested)} de coste valorado` : `On ${formatCurrency(data.summary.valuedInvested)} priced cost`)}</small></div>
              <div><span>{locale === "es" ? "Ingresos realizados" : "Realized proceeds"}</span><strong>{formatCurrency(data.summary.realizedProceeds)}</strong><small>{data.summary.saleCount} {locale === "es" ? "ventas registradas" : "recorded sales"}</small></div>
              <div><span>{locale === "es" ? "P&L realizado" : "Realized P&L"}</span><strong className={data.summary.realizedPnl >= 0 ? "up" : "down"}>{data.summary.realizedPnl >= 0 ? "+" : ""}{formatCurrency(data.summary.realizedPnl)}</strong><small>{locale === "es" ? `Coste asignado ${formatCurrency(data.summary.realizedCostBasis)}` : `Allocated cost ${formatCurrency(data.summary.realizedCostBasis)}`}</small></div>
            </section>

            <p className={styles.pnlDisclosure}>
              {locale === "es"
                ? `El P&L no realizado incluye solo posiciones activas con precio. El P&L realizado usa el precio y coste unitario registrados en cada venta.${data.summary.unpricedHoldings ? ` ${data.summary.unpricedHoldings} posición(es), con ${formatCurrency(data.summary.unpricedInvested)} de coste, no tienen precio actual y se excluyen del valor y P&L no realizado.` : ""}`
                : `Unrealized P&L includes active priced holdings only. Realized P&L uses the unit sale price and allocated purchase cost recorded for each sale.${data.summary.unpricedHoldings ? ` ${data.summary.unpricedHoldings} holding(s), representing ${formatCurrency(data.summary.unpricedInvested)} of cost, have no current price and are excluded from value and unrealized P&L.` : ""}`}
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

            <PortfolioDecisionSection
              locale={locale}
              data={data.mlIntelligence ?? {
                ranking: fallbackRanking,
                mode: "deterministic",
                state: data.holdings.length ? "no_priced_holdings" : "no_portfolio",
                candidateState: "portfolio_unavailable",
                candidateAdditions: [],
                holdingReviews: [],
              }}
              lists={data.lists}
              activeListId={data.selectedListId}
              portfolioValue={data.summary.value}
              selectedHoldingIds={selectedHoldingIds}
              error={portfolioLoadError}
              onAddCandidate={(candidate, rank, listId) => void addCandidate(candidate, rank, listId)}
              onWatchCandidate={(candidate) => void watchCandidate(candidate)}
              onEditHolding={editDecisionHolding}
              onManageHolding={manageDecisionHolding}
              onToggleHolding={(holdingId) =>
                setSelectedHoldingIds((current) =>
                  current.includes(holdingId)
                    ? current.filter((id) => id !== holdingId)
                    : [...current, holdingId],
                )
              }
            />

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
              <span>{locale === "es" ? "Gestionar posiciones" : "Manage holdings"}</span>
              <button type="button" onClick={() => setSelectedHoldingIds(data.holdings.map((holding) => holding.id))}>{locale === "es" ? "Seleccionar todo" : "Select all"}</button>
              {selectedHoldingIds.length > 0 && <button type="button" onClick={() => setSelectedHoldingIds([])}>{locale === "es" ? "Limpiar" : "Clear"}</button>}
              <strong role="status" aria-live="polite">{selectedHoldingIds.length} {locale === "es" ? "seleccionadas" : "selected"}</strong>
            </div>
            <div className="holdings-list">
              {data.holdings.length === 0 && (
                <p className={styles.emptyHoldings}>
                  {locale === "es"
                    ? "No quedan posiciones activas en esta lista."
                    : "No active holdings remain in this list."}
                </p>
              )}
              {data.holdings.map((holding) => <div id={`holding-${holding.id}`} data-selected={selectedHoldingIds.includes(holding.id)} className={`portfolio-row card-surface ${styles.holdingRow} ${updatingHolding === holding.id ? styles.updating : ""}`} key={holding.id} {...cardSurfaceProps(holding.cardId)}>
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
                  <button
                    type="button"
                    className={styles.saleButton}
                    disabled={updatingHolding === holding.id}
                    onClick={(event) => {
                      event.stopPropagation();
                      setSaleError("");
                      setSaleRequestId(crypto.randomUUID());
                      setSaleHolding(holding);
                    }}
                  >
                    <Banknote size={14} />
                    <span>{locale === "es" ? "Registrar venta" : "Record sale"}</span>
                  </button>
                  {editingHolding === holding.id ? <><button disabled={updatingHolding === holding.id} onClick={() => saveHolding(holding.id)} aria-label={`Save ${holding.name}`}><Check size={15} /></button><button disabled={updatingHolding === holding.id} onClick={() => setEditingHolding(null)} aria-label={`Cancel editing ${holding.name}`}><X size={15} /></button></> : <button onClick={() => startEditingHolding(holding)} aria-label={`Edit ${holding.name}`}><Pencil size={14} /></button>}
                  <button disabled={updatingHolding === holding.id} onClick={(event) => { event.stopPropagation(); setConfirmation({ kind: "holding", id: holding.id, name: holding.name }); }} aria-label={`${locale === "es" ? "Eliminar posición" : "Remove holding"} ${holding.name}`}><Trash2 size={15} /></button>
                </div>
              </div>)}
            </div>
            </section>
            {data.recentSales.length > 0 && (
              <section className={`fintech-panel ${styles.salesPanel}`}>
                <div className="section-title">
                  <div>
                    <span className="eyebrow">{locale === "es" ? "Historial inmutable" : "Immutable history"}</span>
                    <h2>{locale === "es" ? "Ventas recientes" : "Recent sales"} · {activeList?.name}</h2>
                  </div>
                  <span>{data.summary.saleCount} {locale === "es" ? "ventas totales" : "total sales"}</span>
                </div>
                <div className={styles.salesList}>
                  {data.recentSales.map((sale) => (
                    <article key={sale.id}>
                      {sale.imageUrl && <img src={sale.imageUrl} alt="" />}
                      <div>
                        <strong>{sale.name}</strong>
                        <span>{sale.setCode.toUpperCase()} · {sale.collectorNumber} · {sale.condition.replaceAll("_", " ")} · {sale.language.toUpperCase()}</span>
                        <small>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${sale.soldAt}T00:00:00Z`))} · {sale.quantity}× {locale === "es" ? "a" : "at"} {formatCurrency(sale.saleUnitPrice)}</small>
                      </div>
                      <dl>
                        <div><dt>{locale === "es" ? "Ingresos" : "Proceeds"}</dt><dd>{formatCurrency(sale.proceeds)}</dd></div>
                        <div><dt>{locale === "es" ? "Coste" : "Cost basis"}</dt><dd>{formatCurrency(sale.costBasis)}</dd></div>
                        <div><dt>{locale === "es" ? "P&L realizado" : "Realized P&L"}</dt><dd className={sale.realizedPnl >= 0 ? "up" : "down"}>{sale.realizedPnl >= 0 ? "+" : ""}{formatCurrency(sale.realizedPnl)}</dd></div>
                      </dl>
                    </article>
                  ))}
                </div>
              </section>
            )}
            {selectedHoldingIds.length > 0 && (
              <div className={styles.bulkBar} role="region" aria-label={locale === "es" ? "Acciones para posiciones seleccionadas" : "Actions for selected holdings"}>
                <div><strong>{selectedHoldingIds.length}</strong><span>{locale === "es" ? "seleccionadas" : "selected"}</span></div>
                <button type="button" disabled={bulkBusy || otherLists.length === 0} onClick={() => { setBulkError(""); setBulkDestination(""); setBulkRequestId(crypto.randomUUID()); setBulkAction("move"); }}><FolderInput size={17} /> <span>{locale === "es" ? "Mover" : "Move"}</span></button>
                <button type="button" disabled={bulkBusy || otherLists.length === 0} onClick={() => { setBulkError(""); setBulkDestination(""); setBulkRequestId(crypto.randomUUID()); setBulkAction("copy"); }}><Copy size={17} /> <span>{locale === "es" ? "Copiar" : "Copy"}</span></button>
                <button type="button" disabled={bulkBusy} data-danger="true" onClick={() => { setBulkError(""); setBulkRequestId(crypto.randomUUID()); setBulkAction("delete"); }}><Trash2 size={17} /> <span>{locale === "es" ? "Eliminar posiciones" : "Remove holdings"}</span></button>
                <button type="button" className={styles.bulkClear} disabled={bulkBusy} onClick={() => setSelectedHoldingIds([])}><X size={17} /><span className="sr-only">{locale === "es" ? "Limpiar selección" : "Clear selection"}</span></button>
              </div>
            )}
          </>
        )}
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
            <label>{locale === "es" ? "Guardar en la lista" : "Save to list"}<select name="listId" value={addDestinationListId || data.selectedListId} onChange={(event) => setAddDestinationListId(event.target.value)}>{data.lists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}</select></label>
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
            await loadPortfolio(data.selectedListId);
          }}
        />
      )}
      <BulkActionDialog
        action={bulkAction}
        count={selectedHoldingIds.length}
        sourceName={activeList?.name ?? ""}
        destinations={otherLists}
        destinationId={bulkDestination}
        busy={bulkBusy}
        error={bulkError}
        locale={locale}
        onDestinationChange={setBulkDestination}
        onClose={() => {
          if (bulkBusy) return;
          setBulkAction(null);
          setBulkError("");
          setBulkRequestId("");
        }}
        onConfirm={() => void runBulkAction()}
      />
      <RecordSaleDialog
        key={saleHolding?.id ?? "closed-sale-dialog"}
        holding={saleHolding}
        busy={saleBusy}
        error={saleError}
        locale={locale}
        onClose={() => {
          if (saleBusy) return;
          setSaleHolding(null);
          setSaleError("");
          setSaleRequestId("");
        }}
        onConfirm={(input) => void recordSale(input)}
      />
      <ConfirmationDialog
        open={confirmation !== null}
        title={confirmationCopy.title}
        description={confirmationCopy.description}
        confirmLabel={confirmationCopy.label}
        busy={confirmationBusy}
        locale={locale}
        onClose={() => {
          if (!confirmationBusy) setConfirmation(null);
        }}
        onConfirm={() => {
          if (confirmation?.kind === "list") {
            void deleteList(confirmation.list);
          } else if (confirmation?.kind === "holding") {
            void removeHolding(confirmation.id);
          } else if (confirmation?.kind === "share_replace") {
            void createShare();
          } else if (confirmation?.kind === "share_revoke") {
            void revokeShare();
          }
        }}
      />
    </main>
  );
}
