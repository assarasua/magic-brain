"use client";

/* eslint-disable @next/next/no-img-element */

import {
  Activity,
  ArrowLeft,
  BarChart3,
  BrainCircuit,
  Gauge,
  Lightbulb,
  LoaderCircle,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AuthControl } from "@/components/auth-control";
import { MagicBrainLogo } from "@/components/brand-logo";
import { useCardDetail } from "@/components/card-detail-provider";
import { LanguageToggle, useLanguage } from "@/components/language-provider";
import { ProGate } from "@/components/pro-gate";
import type { CatalogCard } from "@/lib/catalog";
import { formatCurrency } from "@/lib/data";

type Signal = CatalogCard & { direction: "up" | "down" };

type MarketAnalytics = {
  summary: {
    trackedCards: number;
    advancers: number;
    decliners: number;
    unchanged: number;
    averageReturn: number;
    medianReturn: number;
    dispersion: number;
    strongGainers: number;
    strongLosers: number;
  };
  index: Array<{ date: string; value: number }>;
};

const emptyAnalytics: MarketAnalytics = {
  summary: {
    trackedCards: 0,
    advancers: 0,
    decliners: 0,
    unchanged: 0,
    averageReturn: 0,
    medianReturn: 0,
    dispersion: 0,
    strongGainers: 0,
    strongLosers: 0,
  },
  index: [],
};

function SignalIndexChart({
  points,
  locale,
}: {
  points: MarketAnalytics["index"];
  locale: "en" | "es";
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  if (points.length < 2) {
    return <div className="market-index-empty">{locale === "es" ? "No hay suficiente historial para este periodo." : "Not enough history for this period."}</div>;
  }
  const width = 760;
  const height = 220;
  const min = Math.min(...points.map((point) => point.value));
  const max = Math.max(...points.map((point) => point.value));
  const spread = Math.max(max - min, 0.01);
  const x = (index: number) => (index / (points.length - 1)) * width;
  const y = (value: number) => 10 + (1 - (value - min) / spread) * (height - 20);
  const line = points.map((point, index) => `${x(index)},${y(point.value)}`).join(" ");
  const activeIndex = hovered ?? points.length - 1;
  const active = points[activeIndex];
  const change = active.value - 100;

  return (
    <div
      className="market-index-chart"
      onMouseMove={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
        setHovered(Math.round(ratio * (points.length - 1)));
      }}
      onMouseLeave={() => setHovered(null)}
    >
      <div className="market-index-value"><strong>{active.value.toFixed(2)}</strong><span className={change >= 0 ? "up" : "down"}>{change >= 0 ? "+" : ""}{change.toFixed(2)}%</span></div>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={locale === "es" ? "Índice mediano del mercado" : "Median market index"}>
        <defs><linearGradient id="signalIndexFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f2c66d" stopOpacity=".25" /><stop offset="1" stopColor="#f2c66d" stopOpacity="0" /></linearGradient></defs>
        {[0.25, 0.5, 0.75].map((position) => <line key={position} x1="0" x2={width} y1={height * position} y2={height * position} className="chart-grid-line" />)}
        <polygon points={`0,${height} ${line} ${width},${height}`} fill="url(#signalIndexFill)" />
        <polyline points={line} className="market-index-line" vectorEffect="non-scaling-stroke" />
        <line x1={x(activeIndex)} x2={x(activeIndex)} y1="0" y2={height} className="chart-cursor" vectorEffect="non-scaling-stroke" />
        <circle cx={x(activeIndex)} cy={y(active.value)} r="5" className="market-index-point" vectorEffect="non-scaling-stroke" />
      </svg>
      {hovered !== null && <div className="market-index-tooltip" style={{ left: `${(activeIndex / (points.length - 1)) * 100}%` }}><strong>{active.value.toFixed(2)}</strong><span>{new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(new Date(active.date))}</span></div>}
    </div>
  );
}

function SignalsContent() {
  const { locale } = useLanguage();
  const { cardSurfaceProps } = useCardDetail();
  const es = locale === "es";
  const [signals, setSignals] = useState<Signal[]>([]);
  const [analytics, setAnalytics] = useState(emptyAnalytics);
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [filter, setFilter] = useState<"all" | "up" | "down">("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch(`/api/brain/signals?days=${days}`, { signal: controller.signal }).then((response) => {
        if (!response.ok) throw new Error("Signals unavailable");
        return response.json() as Promise<{ signals: Signal[] }>;
      }),
      fetch(`/api/market/analytics?days=${days}`, { signal: controller.signal }).then((response) => {
        if (!response.ok) throw new Error("Analytics unavailable");
        return response.json() as Promise<MarketAnalytics>;
      }),
    ])
      .then(([signalResult, analyticsResult]) => {
        setSignals(signalResult.signals);
        setAnalytics(analyticsResult);
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") {
          setSignals([]);
          setAnalytics(emptyAnalytics);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [days]);

  const visible = signals.filter(
    (signal) => filter === "all" || signal.direction === filter,
  );
  const totalBreadth =
    analytics.summary.advancers +
    analytics.summary.decliners +
    analytics.summary.unchanged;
  const advanceRate = totalBreadth
    ? (analytics.summary.advancers / totalBreadth) * 100
    : 0;
  const declineRate = totalBreadth
    ? (analytics.summary.decliners / totalBreadth) * 100
    : 0;
  const unchangedRate = Math.max(0, 100 - advanceRate - declineRate);
  const regimeScore = Math.max(
    0,
    Math.min(
      100,
      50 + (advanceRate - 50) * 0.65 + analytics.summary.medianReturn * 2,
    ),
  );
  const regime = regimeScore >= 62
    ? es ? "Expansión" : "Risk-on"
    : regimeScore <= 38
      ? es ? "Defensivo" : "Defensive"
      : es ? "Selectivo" : "Selective";

  return (
    <div className="account-content signals-content">
      <div className="signals-hero">
        <span className="pro-pill"><Sparkles size={13} /> Brain Pro</span>
        <h1>{es ? "Brain Signals" : "Brain Signals"}</h1>
        <p>
          {es
            ? "Señales diarias que convierten movimientos de precio en contexto y próximos pasos."
            : "Daily signals that turn price movement into context and practical next steps."}
        </p>
        <div className="signals-toolbar">
          <div className="signals-controls" aria-label={es ? "Filtrar señales" : "Filter signals"}>
            {([
              ["all", es ? "Todas" : "All"],
              ["up", es ? "Impulso" : "Momentum"],
              ["down", es ? "Correcciones" : "Pullbacks"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                className={filter === value ? "active" : ""}
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="signals-controls" aria-label={es ? "Periodo de análisis" : "Analysis period"}>
            {([7, 30, 90] as const).map((value) => (
              <button
                key={value}
                className={days === value ? "active" : ""}
                aria-pressed={days === value}
                onClick={() => {
                  if (days !== value) {
                    setLoading(true);
                    setDays(value);
                  }
                }}
              >
                {value}D
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="signals-state"><LoaderCircle className="spin" size={24} /> {es ? "Analizando el mercado…" : "Analysing the market…"}</div>
      ) : (
        <>
          <section className="signals-kpi-grid">
            <article><Gauge size={17} /><span>{es ? "Régimen" : "Market regime"}</span><strong>{regime}</strong><small>{regimeScore.toFixed(0)}/100</small></article>
            <article><TrendingUp size={17} /><span>{es ? "Amplitud positiva" : "Positive breadth"}</span><strong className="up">{advanceRate.toFixed(1)}%</strong><small>{analytics.summary.advancers.toLocaleString(locale)} {es ? "cartas subiendo" : "cards advancing"}</small></article>
            <article><BarChart3 size={17} /><span>{es ? "Rentabilidad mediana" : "Median return"}</span><strong className={analytics.summary.medianReturn >= 0 ? "up" : "down"}>{analytics.summary.medianReturn >= 0 ? "+" : ""}{analytics.summary.medianReturn.toFixed(2)}%</strong><small>{days}D · {analytics.summary.trackedCards.toLocaleString(locale)} {es ? "seguidas" : "tracked"}</small></article>
            <article><Activity size={17} /><span>{es ? "Dispersión" : "Market dispersion"}</span><strong>{analytics.summary.dispersion.toFixed(1)}%</strong><small>{es ? "Diferencia entre movimientos" : "Variation across card returns"}</small></article>
          </section>

          <section className="signals-market-workspace">
            <div className="fintech-panel signals-index-panel">
              <div className="section-title"><div><span className="eyebrow">{es ? "ÍNDICE MAGIC BRAIN" : "MAGIC BRAIN INDEX"}</span><h2>{es ? "Tendencia mediana del mercado" : "Median market trend"}</h2></div><span className="live-badge"><i /> {days}D</span></div>
              <SignalIndexChart points={analytics.index} locale={locale} />
            </div>
            <div className="fintech-panel breadth-panel">
              <span className="eyebrow">{es ? "PARTICIPACIÓN DEL MERCADO" : "MARKET PARTICIPATION"}</span>
              <h2>{es ? "Amplitud" : "Breadth"}</h2>
              <div className="breadth-score"><strong>{advanceRate.toFixed(0)}%</strong><span>{es ? "participación alcista" : "bullish participation"}</span></div>
              <div className="breadth-bar" aria-label={`${advanceRate.toFixed(1)}% up, ${unchangedRate.toFixed(1)}% flat, ${declineRate.toFixed(1)}% down`}>
                <i className="up" style={{ width: `${advanceRate}%` }} />
                <i className="flat" style={{ width: `${unchangedRate}%` }} />
                <i className="down" style={{ width: `${declineRate}%` }} />
              </div>
              <div className="breadth-legend"><span><i className="up" />{es ? "Suben" : "Advancing"} <b>{analytics.summary.advancers.toLocaleString(locale)}</b></span><span><i className="flat" />{es ? "Estables" : "Flat"} <b>{analytics.summary.unchanged.toLocaleString(locale)}</b></span><span><i className="down" />{es ? "Bajan" : "Declining"} <b>{analytics.summary.decliners.toLocaleString(locale)}</b></span></div>
              <div className="breadth-extremes"><span><b>{analytics.summary.strongGainers}</b>{es ? " subidas >10%" : " gains >10%"}</span><span><b>{analytics.summary.strongLosers}</b>{es ? " caídas >10%" : " drops >10%"}</span></div>
            </div>
          </section>

          <div className="signals-section-heading">
            <div><span className="eyebrow">{es ? "OPORTUNIDADES PRIORIZADAS" : "PRIORITISED OPPORTUNITIES"}</span><h2>{es ? "Señales accionables" : "Actionable signals"}</h2></div>
            <p>{es ? "Abre cualquier carta para validar su histórico, riesgo y precio de entrada." : "Open any card to validate its history, risk, and entry price."}</p>
          </div>

          {visible.length ? <div className="signals-grid">
          {visible.map((signal) => {
            const change = signal.change7d ?? 0;
            const strong = Math.abs(change) >= 15;
            const breadthAligned =
              (signal.direction === "up" && advanceRate >= 50) ||
              (signal.direction === "down" && declineRate >= 50);
            const signalScore = Math.round(Math.max(
              1,
              Math.min(
                99,
                45 +
                  Math.min(35, Math.abs(change) * 1.4) +
                  (breadthAligned ? 10 : 0) -
                  Math.min(12, analytics.summary.dispersion * 0.2),
              ),
            ));
            const highRisk =
              Math.abs(change) >= 25 || analytics.summary.dispersion >= 30;
            const watchPrice = signal.price === null
              ? null
              : signal.price * (strong ? 0.92 : 0.97);
            const buyerTip = signal.direction === "up"
              ? strong
                ? es ? "No persigas la subida. Espera consolidación o divide la entrada." : "Do not chase the move. Wait for consolidation or scale into the position."
                : es ? "Confirma liquidez y compara el coste total antes de entrar." : "Confirm liquidity and compare total cost before entering."
              : es ? "Espera estabilización y configura una alerta antes de comprar la caída." : "Wait for stabilisation and set an alert before buying the dip.";
            return (
              <article className="signal-card card-surface" key={`${signal.direction}-${signal.id}`} {...cardSurfaceProps(signal)}>
                {signal.imageUrl && <img src={signal.imageUrl} alt="" />}
                <div className="signal-card-copy">
                  <div>
                    <span className={`signal-direction ${signal.direction}`}>
                      {signal.direction === "up" ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                      {signal.direction === "up" ? (es ? "Impulso" : "Momentum") : (es ? "Corrección" : "Pullback")}
                    </span>
                    <span className="signal-strength">{strong ? (es ? "Fuerte" : "Strong") : (es ? "Moderada" : "Moderate")}</span>
                  </div>
                  <h2>{signal.name}</h2>
                  <p>{signal.setName} · {signal.setCode.toUpperCase()}</p>
                  <div className="signal-numbers">
                    <strong>{signal.price == null ? "—" : formatCurrency(signal.price)}</strong>
                    <span className={signal.direction === "up" ? "up" : "down"}>
                      {change >= 0 ? "+" : ""}{change.toFixed(1)}% <small>{days}D</small>
                    </span>
                  </div>
                  <div className="signal-diagnostics">
                    <span><small>{es ? "Puntuación" : "Signal score"}</small><b>{signalScore}/100</b></span>
                    <span><small>{es ? "Riesgo" : "Risk"}</small><b className={highRisk ? "down" : ""}>{highRisk ? (es ? "Alto" : "High") : (es ? "Moderado" : "Moderate")}</b></span>
                    <span><small>{es ? "Zona de vigilancia" : "Watch zone"}</small><b>{watchPrice === null ? "—" : `≤ ${formatCurrency(watchPrice)}`}</b></span>
                  </div>
                  <div className="signal-tip"><Lightbulb size={15} /><span><b>{es ? "Consejo para compradores" : "Buyer tip"}</b>{buyerTip}</span></div>
                </div>
              </article>
            );
          })}
          </div> : (
            <div className="signals-state"><BrainCircuit size={25} /> {es ? "No hay señales disponibles ahora." : "No signals are available right now."}</div>
          )}
        </>
      )}

      <div className="signals-disclaimer">
        <ShieldCheck size={15} />
        {es ? "Las señales son análisis de mercado, no asesoramiento financiero." : "Signals are market analysis, not financial advice."}
      </div>
    </div>
  );
}

export default function SignalsPage() {
  const { locale, t } = useLanguage();
  return (
    <main className="account-page signals-page">
      <header className="account-topbar">
        <Link href="/" className="inventory-brand"><MagicBrainLogo /></Link>
        <nav><Link href="/market">{t("Market")}</Link><Link href="/brain-pro">Brain Pro</Link><Link href="/analyst">Ask Brain</Link></nav>
        <LanguageToggle />
        <AuthControl compact />
        <Link href="/" className="back-dashboard"><ArrowLeft size={15} /> {locale === "es" ? "Panel" : "Dashboard"}</Link>
      </header>
      <ProGate feature="signals"><SignalsContent /></ProGate>
    </main>
  );
}
