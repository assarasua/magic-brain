"use client";

/* eslint-disable @next/next/no-img-element */

import {
  ArrowLeft,
  BriefcaseBusiness,
  CircleAlert,
  ExternalLink,
  Focus,
  LoaderCircle,
  Minus,
  Network,
  Plus,
  Search,
  Star,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import {
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AuthControl } from "@/components/auth-control";
import { MagicBrainLogo } from "@/components/brand-logo";
import { useCardDetail } from "@/components/card-detail-provider";
import { LanguageToggle, useLanguage } from "@/components/language-provider";
import { MlInsight, trackMlFeedback } from "@/components/ml-insight";
import { formatCurrency } from "@/lib/data";
import type { MlCardContext, MlRankingStatus } from "@/lib/ml-experience";
import type {
  OpportunityClassification,
  OpportunityGraph,
  OpportunityGraphNode,
} from "@/lib/opportunity-graph-model";
import styles from "./page.module.css";

type MlGraphNode = OpportunityGraphNode & { ml?: MlCardContext | null };

type GraphPayload = Omit<OpportunityGraph, "nodes"> & {
  nodes: MlGraphNode[];
  focusId: string | null;
  asOf: string | null;
  ranking: MlRankingStatus;
  methodology: {
    maximumNodes: number;
    neighboursPerNode: number;
    similarityWeights: Record<string, number>;
  };
};

const clusterColors: Record<OpportunityClassification, string> = {
  strong_growth: "#4fdaa4",
  recovery_opportunity: "#48b9ff",
  stable_value: "#b69cff",
  lost_momentum: "#ff8a72",
};

const classificationLabels: Record<OpportunityClassification, string> = {
  strong_growth: "Strong growth",
  recovery_opportunity: "Recovery opportunity",
  stable_value: "Stable value",
  lost_momentum: "Cooling momentum",
};

const signedPercent = (value: number) =>
  `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;

export default function OpportunityGraphPage() {
  const { locale } = useLanguage();
  const { openCard, cardSurfaceProps } = useCardDetail();
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; originX: number; originY: number } | null>(null);
  const [graph, setGraph] = useState<GraphPayload | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });

  const loadGraph = useCallback(async (search?: string) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: "48" });
      if (search?.trim()) params.set("q", search.trim());
      const response = await fetch(`/api/opportunity-graph?${params}`);
      if (!response.ok) throw new Error("Graph unavailable");
      const result = (await response.json()) as GraphPayload;
      setGraph(result);
      setSelectedId(result.focusId ?? result.nodes[0]?.id ?? "");
      setTransform({ x: 0, y: 0, scale: 1 });
    } catch {
      setError(
        locale === "es"
          ? "No se pudo construir el gráfico."
          : "The opportunity graph could not be built.",
      );
    } finally {
      setLoading(false);
    }
  }, [locale]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/opportunity-graph?limit=48", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Graph unavailable");
        return response.json() as Promise<GraphPayload>;
      })
      .then((result) => {
        setGraph(result);
        setSelectedId(result.focusId ?? result.nodes[0]?.id ?? "");
      })
      .catch((requestError: Error) => {
        if (requestError.name !== "AbortError") {
          setError(
            locale === "es"
              ? "No se pudo construir el gráfico."
              : "The opportunity graph could not be built.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [locale]);

  const nodesById = useMemo(
    () => new Map(graph?.nodes.map((node) => [node.id, node]) ?? []),
    [graph],
  );
  const selected = nodesById.get(selectedId) ?? null;
  const selectedLinks = useMemo(
    () =>
      (graph?.links ?? [])
        .filter((link) => link.source === selectedId || link.target === selectedId)
        .sort((left, right) => right.similarity - left.similarity),
    [graph, selectedId],
  );
  const neighbours = selectedLinks
    .map((link) =>
      nodesById.get(link.source === selectedId ? link.target : link.source),
    )
    .filter((node): node is OpportunityGraphNode => Boolean(node));
  const suggestions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (normalized.length < 2) return [];
    return (graph?.nodes ?? [])
      .filter(
        (node) =>
          node.name.toLowerCase().includes(normalized) ||
          node.setName.toLowerCase().includes(normalized) ||
          node.setCode.toLowerCase() === normalized,
      )
      .slice(0, 5);
  }, [graph, query]);

  const focusNode = (node: MlGraphNode) => {
    setSelectedId(node.id);
    const bounds = viewportRef.current?.getBoundingClientRect();
    if (bounds && bounds.width >= 700) {
      const scale = Math.max(transform.scale, 1.25);
      setTransform({
        scale,
        x: 500 - node.x * scale,
        y: 350 - node.y * scale,
      });
    }
  };

  const activateNode = (node: MlGraphNode) => {
    if (node.id === selectedId) {
      openCard(node.id);
      return;
    }
    focusNode(node);
  };

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    setSuggestionsOpen(false);
    const local = suggestions[0];
    if (local) {
      focusNode(local);
      setQuery(local.name);
      return;
    }
    void loadGraph(query);
  };

  const zoom = (delta: number) =>
    setTransform((current) => ({
      ...current,
      scale: Math.max(0.65, Math.min(2.4, current.scale + delta)),
    }));

  const startPan = (event: ReactPointerEvent<SVGSVGElement>) => {
    if ((event.target as Element).closest("[data-node]")) return;
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      originX: transform.x,
      originY: transform.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const movePan = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    setTransform((current) => ({
      ...current,
      x: drag.originX + event.clientX - drag.x,
      y: drag.originY + event.clientY - drag.y,
    }));
  };

  const addCards = async (
    cards: MlGraphNode[],
    destination: "portfolio" | "watchlist",
  ) => {
    if (!cards.length || saving) return;
    setSaving(true);
    const responses = await Promise.all(
      cards.map((card) =>
        fetch(`/api/${destination}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            destination === "portfolio"
              ? {
                  cardId: card.id,
                  quantity: 1,
                  purchasePrice: card.price,
                  condition: "near_mint",
                  language: "en",
                }
              : { cardId: card.id },
          ),
        }),
      ),
    );
    const saved = responses.filter((response) => response.ok).length;
    responses.forEach((response, index) => {
      const card = cards[index];
      if (!response.ok || !card.ml) return;
      trackMlFeedback({
        eventType: destination === "portfolio"
          ? "add_to_portfolio"
          : "save_to_watchlist",
        surface: "opportunity_graph",
        cardId: card.id,
        context: card.ml,
        rankPosition: Math.max(
          1,
          (graph?.nodes.findIndex((node) => node.id === card.id) ?? 0) + 1,
        ),
      });
    });
    setNotice(
      saved === cards.length
        ? `${saved} ${saved === 1 ? "card" : "cards"} added to ${destination}`
        : `${saved} of ${cards.length} cards added`,
    );
    window.setTimeout(() => setNotice(""), 2600);
    setSaving(false);
  };

  const createAlert = async (card: MlGraphNode) => {
    const targetPrice = Number((card.price * 0.95).toFixed(2));
    if (!window.confirm(
      locale === "es"
        ? `¿Guardar ${card.name} y avisarte si baja de ${formatCurrency(targetPrice)}?`
        : `Save ${card.name} and alert if it falls below ${formatCurrency(targetPrice)}?`,
    )) return;
    if (!card.ml) return;
    const [watchResponse, smartResponse] = await Promise.all([
      fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardId: card.id,
          targetPrice,
          alertBelowEnabled: true,
        }),
      }),
      fetch("/api/ml/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: card.id, scoreId: card.ml.scoreId }),
      }),
    ]);
    if (watchResponse.ok && smartResponse.ok) {
      trackMlFeedback({
        eventType: "alert_action",
        surface: "alert",
        cardId: card.id,
        context: card.ml,
        rankPosition: Math.max(
          1,
          (graph?.nodes.findIndex((node) => node.id === card.id) ?? 0) + 1,
        ),
        alertAction: "save",
      });
    }
  };

  return (
    <main className={`account-page ${styles.page}`}>
      <header className="account-topbar">
        <Link href="/" className="inventory-brand"><MagicBrainLogo /></Link>
        <nav>
          <Link href="/market">Market</Link>
          <Link href="/graph" aria-current="page">Opportunity Graph</Link>
          <Link href="/portfolio">Portfolio</Link>
          <Link href="/watchlist">Watchlist</Link>
        </nav>
        <LanguageToggle />
        <AuthControl compact />
        <Link href="/market" className="back-dashboard"><ArrowLeft size={15} /> Market</Link>
      </header>

      <div className={styles.content}>
        <section className={styles.hero}>
          <div>
            <span className="eyebrow"><Network size={14} /> Market relationships</span>
            <h1>Opportunity Graph</h1>
            <p>
              Explore priced cards by signal, momentum, stability, rarity, type,
              and set similarity. Every connection explains why it exists.
            </p>
          </div>
          <form className={styles.search} onSubmit={submitSearch}>
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setSuggestionsOpen(true);
              }}
              onFocus={() => {
                if (query.trim().length >= 2) setSuggestionsOpen(true);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") setSuggestionsOpen(false);
              }}
              placeholder="Find a card or set…"
              aria-label="Find a card or set"
              role="combobox"
              aria-autocomplete="list"
              aria-controls="graph-search-suggestions"
              aria-expanded={suggestionsOpen && suggestions.length > 0}
            />
            <button type="submit">Focus</button>
            {suggestionsOpen && suggestions.length > 0 && (
              <div id="graph-search-suggestions" className={styles.suggestions}>
                {suggestions.map((node) => (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => {
                      focusNode(node);
                      setQuery(node.name);
                      setSuggestionsOpen(false);
                    }}
                  >
                    <span>{node.name}</span>
                    <small>{node.setCode.toUpperCase()} · {formatCurrency(node.price)}</small>
                  </button>
                ))}
              </div>
            )}
          </form>
        </section>

        <aside className={styles.disclaimer}>
          <CircleAlert size={16} />
          Signals describe historical price behaviour, not guaranteed returns or
          financial advice.
          {graph?.asOf && <span>Prices as of {graph.asOf}</span>}
        </aside>
        {graph && (
          <MlInsight
            locale={locale}
            ranking={graph.ranking}
            surface="opportunity_graph"
          />
        )}

        {loading ? (
          <div className={styles.state}><LoaderCircle className="spin" /> Building relationships…</div>
        ) : error ? (
          <div className={styles.state}><CircleAlert /> {error}<button onClick={() => loadGraph()}>Try again</button></div>
        ) : graph && graph.nodes.length > 0 ? (
          <div className={styles.workspace}>
            <section className={styles.graphPanel}>
              <div className={styles.legend}>
                {graph.clusters.map((cluster) => (
                  <span key={cluster.id}>
                    <i style={{ background: clusterColors[cluster.id] }} />
                    {cluster.label} <small>{cluster.count}</small>
                  </span>
                ))}
              </div>
              <div className={styles.viewport} ref={viewportRef}>
                <svg
                  className={styles.graph}
                  viewBox="0 0 1000 700"
                  onPointerDown={startPan}
                  onPointerMove={movePan}
                  onPointerUp={() => { dragRef.current = null; }}
                  onPointerCancel={() => { dragRef.current = null; }}
                  onWheel={(event) => {
                    event.preventDefault();
                    zoom(event.deltaY > 0 ? -0.1 : 0.1);
                  }}
                  aria-label="Interactive opportunity graph"
                >
                  <g transform={`translate(${transform.x} ${transform.y}) scale(${transform.scale})`}>
                    {graph.clusters.map((cluster) => (
                      <g key={cluster.id} className={styles.clusterLabel} transform={`translate(${cluster.x} ${cluster.y - 130})`}>
                        <text textAnchor="middle">{cluster.label}</text>
                        <text y="17" textAnchor="middle">{cluster.count} cards</text>
                      </g>
                    ))}
                    {graph.links.map((link) => {
                      const source = nodesById.get(link.source);
                      const target = nodesById.get(link.target);
                      if (!source || !target) return null;
                      const active = link.source === selectedId || link.target === selectedId;
                      return (
                        <line
                          key={`${link.source}:${link.target}`}
                          x1={source.x}
                          y1={source.y}
                          x2={target.x}
                          y2={target.y}
                          className={active ? styles.activeLink : styles.link}
                          strokeWidth={active ? 1.5 + link.similarity / 45 : 0.45 + link.similarity / 130}
                        />
                      );
                    })}
                    {graph.nodes.map((node) => {
                      const active = node.id === selectedId;
                      const related = selectedLinks.some(
                        (link) => link.source === node.id || link.target === node.id,
                      );
                      return (
                        <g
                          key={node.id}
                          data-node
                          role="button"
                          tabIndex={0}
                          aria-label={`${node.name}, ${classificationLabels[node.classification]}. ${
                            active ? "Open card details" : "Select card"
                          }`}
                          aria-pressed={active}
                          className={`${styles.node} ${active ? styles.selectedNode : ""} ${selectedId && !active && !related ? styles.dimmedNode : ""}`}
                          transform={`translate(${node.x} ${node.y})`}
                          onClick={() => activateNode(node)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              activateNode(node);
                            }
                          }}
                        >
                          <circle
                            r={active ? 17 : 11 + node.opportunityScore / 22}
                            fill={clusterColors[node.classification]}
                          />
                          <text y={active ? 31 : 27} textAnchor="middle">{node.name}</text>
                        </g>
                      );
                    })}
                  </g>
                </svg>
                <div className={styles.zoomControls}>
                  <button onClick={() => zoom(0.2)} aria-label="Zoom in"><Plus size={16} /></button>
                  <button onClick={() => zoom(-0.2)} aria-label="Zoom out"><Minus size={16} /></button>
                  <button onClick={() => setTransform({ x: 0, y: 0, scale: 1 })} aria-label="Reset view"><Focus size={16} /></button>
                </div>
                <p className={styles.graphHint}>Drag to pan · scroll to zoom · activate a selected card for details</p>
              </div>
            </section>

            {selected && (
              <aside className={styles.detail} {...cardSurfaceProps(selected.id)}>
                <div className={styles.cardHead}>
                  {selected.imageUrl && <img src={selected.imageUrl} alt="" />}
                  <div>
                    <span style={{ color: clusterColors[selected.classification] }}>
                      {classificationLabels[selected.classification]}
                    </span>
                    <h2>{selected.name}</h2>
                    <p>{selected.setName} · {selected.rarity}</p>
                  </div>
                </div>
                <div className={styles.metrics}>
                  <div><span>Market price</span><strong>{formatCurrency(selected.price)}</strong></div>
                  <div><span>Opportunity</span><strong>{selected.opportunityScore}/100</strong></div>
                  <div><span>7D momentum</span><strong className={selected.change7d >= 0 ? "up" : "down"}>{signedPercent(selected.change7d)}</strong></div>
                  <div><span>30D momentum</span><strong className={selected.change30d >= 0 ? "up" : "down"}>{signedPercent(selected.change30d)}</strong></div>
                  <div><span>Stability</span><strong>{selected.stability}/100</strong></div>
                  <div><span>Risk</span><strong>{selected.risk}</strong></div>
                </div>
                <button className={styles.fullDetails} onClick={() => openCard(selected.id)}>
                  Open price history and details <ExternalLink size={14} />
                </button>
                <MlInsight
                  locale={locale}
                  ranking={graph.ranking}
                  context={selected.ml ?? undefined}
                  surface="opportunity_graph"
                  cardId={selected.id}
                  rankPosition={graph.nodes.findIndex((node) => node.id === selected.id) + 1}
                  onCreateAlert={() => void createAlert(selected)}
                />
                <div className={styles.actions}>
                  <button disabled={saving} onClick={() => addCards([selected], "portfolio")}><BriefcaseBusiness size={15} /> Add card to portfolio</button>
                  <button disabled={saving} onClick={() => addCards([selected], "watchlist")}><Star size={15} /> Add card to watchlist</button>
                  <button disabled={saving || !neighbours.length} onClick={() => addCards(neighbours, "portfolio")}><BriefcaseBusiness size={15} /> Add {neighbours.length} neighbours to portfolio</button>
                  <button disabled={saving || !neighbours.length} onClick={() => addCards(neighbours, "watchlist")}><Star size={15} /> Add {neighbours.length} neighbours to watchlist</button>
                </div>
                <div className={styles.neighbours}>
                  <h3>Nearest neighbours</h3>
                  {selectedLinks.map((link) => {
                    const node = nodesById.get(link.source === selected.id ? link.target : link.source);
                    if (!node) return null;
                    return (
                      <button key={node.id} onClick={() => focusNode(node)}>
                        <span>
                          <strong>{node.name}</strong>
                          <small>{link.reasons.join(" · ")}</small>
                        </span>
                        <b>{link.similarity}%</b>
                      </button>
                    );
                  })}
                </div>
              </aside>
            )}
          </div>
        ) : (
          <div className={styles.state}>No priced cards have enough history to graph.</div>
        )}

        {graph && (
          <section className={styles.mobileList}>
            <h2>Opportunity map</h2>
            {graph.nodes.map((node) => (
              <button key={node.id} onClick={() => setSelectedId(node.id)}>
                <i style={{ background: clusterColors[node.classification] }} />
                <span><strong>{node.name}</strong><small>{classificationLabels[node.classification]} · {node.setCode.toUpperCase()}</small></span>
                <b>{node.change7d >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}{signedPercent(node.change7d)}</b>
              </button>
            ))}
          </section>
        )}
      </div>
      {notice && <div className="toast">{notice}</div>}
    </main>
  );
}
