"use client";

import { useId, useMemo, useState } from "react";
import type {
  ForecastHorizon,
  PortfolioForecast,
} from "@/lib/portfolio-forecast-model";
import styles from "@/app/portfolio/portfolio.module.css";

type Locale = "en" | "es";

const WIDTH = 1000;
const HEIGHT = 320;
const LEFT = 62;
const RIGHT = 18;
const TOP = 20;
const BOTTOM = 38;
const ANCHOR_X = 225;

const linePoints = (
  values: Array<{ x: number; value: number }>,
  y: (value: number) => number,
) => values.map((point) => `${point.x},${y(point.value)}`).join(" ");

export function PortfolioForecastChart({
  forecast,
  history,
  locale,
}: {
  forecast: PortfolioForecast;
  history: Array<{ date: string; value: number }>;
  locale: Locale;
}) {
  const [horizon, setHorizon] = useState<ForecastHorizon>(3);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const gradientId = useId().replaceAll(":", "");
  const currency = useMemo(
    () =>
      new Intl.NumberFormat(locale === "es" ? "es-ES" : "en-GB", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
      }),
    [locale],
  );
  const date = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en-GB", {
        month: "short",
        year: "numeric",
      }),
    [locale],
  );
  const visible = forecast.points.slice(0, horizon * 12 + 1);

  if (!visible.length) {
    return (
      <div className={styles.forecastUnavailable} role="status">
        <strong>
          {locale === "es"
            ? "Previsión no disponible todavía"
            : "Forecast not available yet"}
        </strong>
        <span>
          {locale === "es"
            ? "Añade al menos una posición con un precio de mercado válido."
            : "Add at least one holding with a valid market price."}
        </span>
      </div>
    );
  }

  const historical = history
    .filter((point) => Number.isFinite(point.value) && point.value > 0)
    .slice(-90);
  const historyValues = [
    ...historical.map((point, index) => ({
      x:
        historical.length > 1
          ? LEFT + (index / (historical.length - 1)) * (ANCHOR_X - LEFT)
          : ANCHOR_X,
      value: point.value,
    })),
    { x: ANCHOR_X, value: visible[0].base },
  ];
  const forecastValues = visible.map((point, index) => ({
    ...point,
    x:
      ANCHOR_X +
      (index / Math.max(1, visible.length - 1)) *
        (WIDTH - RIGHT - ANCHOR_X),
  }));
  const allValues = [
    ...historyValues.map((point) => point.value),
    ...forecastValues.flatMap((point) => [
      point.conservative,
      point.optimistic,
    ]),
  ];
  const rawMin = Math.min(...allValues);
  const rawMax = Math.max(...allValues);
  const padding = Math.max((rawMax - rawMin) * 0.1, rawMax * 0.025, 1);
  const minimum = Math.max(0, rawMin - padding);
  const maximum = rawMax + padding;
  const y = (value: number) =>
    TOP +
    ((maximum - value) / Math.max(1, maximum - minimum)) *
      (HEIGHT - TOP - BOTTOM);
  const bandPoints = [
    ...forecastValues.map((point) => `${point.x},${y(point.optimistic)}`),
    ...forecastValues
      .toReversed()
      .map((point) => `${point.x},${y(point.conservative)}`),
  ].join(" ");
  const active =
    activeIndex === null ? forecastValues.at(-1)! : forecastValues[activeIndex];
  const end = forecastValues.at(-1)!;
  const anchor = visible[0].base;
  const baseChange = anchor > 0 ? ((end.base / anchor - 1) * 100) : 0;
  const sourceLabel =
    forecast.source === "ml_assisted"
      ? locale === "es"
        ? "Escenario asistido por ML verificado"
        : "Verified ML-assisted scenario"
      : locale === "es"
        ? "Escenario determinista"
        : "Deterministic scenario";
  const confidenceLabel = {
    low: locale === "es" ? "baja" : "low",
    medium: locale === "es" ? "media" : "medium",
    high: locale === "es" ? "alta" : "high",
  }[forecast.confidence];

  const selectFromClientX = (
    clientX: number,
    element: HTMLDivElement,
  ) => {
    const bounds = element.getBoundingClientRect();
    const plotAnchor = (ANCHOR_X / WIDTH) * bounds.width;
    const ratio = clamp(
      (clientX - bounds.left - plotAnchor) /
        Math.max(1, bounds.width - plotAnchor),
      0,
      1,
    );
    setActiveIndex(Math.round(ratio * (forecastValues.length - 1)));
  };

  return (
    <section
      className={styles.forecastPanel}
      aria-labelledby="portfolio-forecast-title"
    >
      <div className={styles.forecastHeader}>
        <div>
          <span className="eyebrow">
            {locale === "es" ? "ESCENARIOS DE CARTERA" : "PORTFOLIO SCENARIOS"}
          </span>
          <h2 id="portfolio-forecast-title">
            {locale === "es"
              ? "Rango de valor proyectado"
              : "Projected value range"}
          </h2>
        </div>
        <div
          className={styles.horizonSelector}
          role="group"
          aria-label={locale === "es" ? "Horizonte" : "Forecast horizon"}
        >
          {([1, 3, 5] as const).map((years) => (
            <button
              key={years}
              type="button"
              aria-pressed={horizon === years}
              onClick={() => {
                setHorizon(years);
                setActiveIndex(null);
              }}
            >
              {years}Y
            </button>
          ))}
        </div>
      </div>

      <div className={styles.forecastKpis}>
        <div>
          <span>{locale === "es" ? "Escenario base" : "Base scenario"}</span>
          <strong>{currency.format(end.base)}</strong>
          <em className={baseChange >= 0 ? "up" : "down"}>
            {baseChange >= 0 ? "+" : ""}
            {baseChange.toFixed(1)}%
          </em>
        </div>
        <div>
          <span>{locale === "es" ? "Rango al final" : "End range"}</span>
          <strong>
            {currency.format(end.conservative)}–{currency.format(end.optimistic)}
          </strong>
        </div>
        <div>
          <span>{locale === "es" ? "Cobertura" : "Coverage"}</span>
          <strong>{forecast.coverage.projectedValuePercent.toFixed(0)}%</strong>
          <small>
            {forecast.coverage.forecastableHoldings}/
            {forecast.coverage.totalHoldings}{" "}
            {locale === "es" ? "posiciones proyectadas" : "holdings projected"}
          </small>
        </div>
      </div>

      <div
        className={styles.forecastPlot}
        tabIndex={0}
        aria-label={
          locale === "es"
            ? "Gráfico interactivo de escenarios de valor de cartera"
            : "Interactive portfolio value scenario chart"
        }
        onPointerMove={(event) =>
          selectFromClientX(event.clientX, event.currentTarget)
        }
        onPointerLeave={() => setActiveIndex(null)}
        onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
          event.preventDefault();
          const current = activeIndex ?? forecastValues.length - 1;
          setActiveIndex(
            clamp(
              current + (event.key === "ArrowRight" ? 1 : -1),
              0,
              forecastValues.length - 1,
            ),
          );
        }}
      >
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-hidden="true">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#d3ad62" stopOpacity=".3" />
              <stop offset="1" stopColor="#8b5cf6" stopOpacity=".06" />
            </linearGradient>
          </defs>
          {[0, 0.5, 1].map((position) => {
            const gridY = TOP + position * (HEIGHT - TOP - BOTTOM);
            return (
              <g key={position}>
                <line
                  x1={LEFT}
                  x2={WIDTH - RIGHT}
                  y1={gridY}
                  y2={gridY}
                  className={styles.forecastGrid}
                />
                <text x={LEFT - 8} y={gridY + 3} textAnchor="end">
                  {currency.format(maximum - position * (maximum - minimum))}
                </text>
              </g>
            );
          })}
          <polygon points={bandPoints} fill={`url(#${gradientId})`} />
          <polyline
            points={linePoints(
              forecastValues.map((point) => ({
                x: point.x,
                value: point.optimistic,
              })),
              y,
            )}
            className={styles.optimisticLine}
          />
          <polyline
            points={linePoints(
              forecastValues.map((point) => ({
                x: point.x,
                value: point.conservative,
              })),
              y,
            )}
            className={styles.conservativeLine}
          />
          <polyline
            points={linePoints(
              forecastValues.map((point) => ({
                x: point.x,
                value: point.base,
              })),
              y,
            )}
            className={styles.baseLine}
          />
          {historyValues.length > 1 && (
            <polyline
              points={linePoints(historyValues, y)}
              className={styles.historicalLine}
            />
          )}
          <line
            x1={ANCHOR_X}
            x2={ANCHOR_X}
            y1={TOP}
            y2={HEIGHT - BOTTOM}
            className={styles.anchorLine}
          />
          <line
            x1={active.x}
            x2={active.x}
            y1={TOP}
            y2={HEIGHT - BOTTOM}
            className={styles.cursorLine}
          />
          <circle
            cx={active.x}
            cy={y(active.base)}
            r="5"
            className={styles.forecastPoint}
          />
          <text x={ANCHOR_X} y={HEIGHT - 10} textAnchor="middle">
            {locale === "es" ? "Ahora" : "Now"}
          </text>
          <text x={WIDTH - RIGHT} y={HEIGHT - 10} textAnchor="end">
            {horizon}Y
          </text>
        </svg>
        <div
          className={styles.forecastTooltip}
          style={{
            left: `${(active.x / WIDTH) * 100}%`,
            transform:
              active.x > WIDTH * 0.82
                ? "translateX(-100%)"
                : active.x < WIDTH * 0.34
                  ? "translateX(0)"
                  : "translateX(-50%)",
          }}
        >
          <span>{date.format(new Date(`${active.date}T00:00:00Z`))}</span>
          <strong>{currency.format(active.base)}</strong>
          <small>
            {currency.format(active.conservative)} –{" "}
            {currency.format(active.optimistic)}
          </small>
        </div>
      </div>

      <div className={styles.forecastLegend} aria-label="Chart legend">
        <span><i data-series="history" />{locale === "es" ? "Histórico" : "Historical"}</span>
        <span><i data-series="base" />{locale === "es" ? "Base" : "Base"}</span>
        <span><i data-series="range" />{locale === "es" ? "Rango conservador–optimista" : "Conservative–optimistic range"}</span>
      </div>

      <p className={styles.forecastSummary}>
        {locale === "es"
          ? `${sourceLabel}${forecast.modelVersion ? ` (${forecast.modelVersion}; ${forecast.coverage.mlValuePercent.toFixed(0)}% de cobertura ML)` : ""}; confianza ${confidenceLabel}. Datos de precios a ${forecast.dataDate ?? "—"}. La incertidumbre aumenta con el tiempo.`
          : `${sourceLabel}${forecast.modelVersion ? ` (${forecast.modelVersion}; ${forecast.coverage.mlValuePercent.toFixed(0)}% ML coverage)` : ""}; ${confidenceLabel} confidence. Price data as of ${forecast.dataDate ?? "—"}. Uncertainty increases over time.`}{" "}
        {forecast.coverage.staleCarriedHoldings > 0 &&
          (locale === "es"
            ? `${forecast.coverage.staleCarriedHoldings} posiciones con precio antiguo se mantienen planas. `
            : `${forecast.coverage.staleCarriedHoldings} stale-priced holdings are carried flat. `)}
        {forecast.coverage.excludedHoldings > 0 &&
          (locale === "es"
            ? `${forecast.coverage.excludedHoldings} posiciones sin precio se excluyen. `
            : `${forecast.coverage.excludedHoldings} unpriced holdings are excluded. `)}
        {locale === "es"
          ? `Supuesto base anual limitado al ${forecast.assumptions.annualBaseRatePercent.toFixed(1)}%; no predice precios exactos ni garantiza rentabilidad. No es asesoramiento financiero.`
          : `Annual base assumption capped at ${forecast.assumptions.annualBaseRatePercent.toFixed(1)}%; this does not predict exact prices or guarantee returns. Not financial advice.`}
      </p>
    </section>
  );
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
