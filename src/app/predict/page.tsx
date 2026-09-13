"use client";

import {
  ArrowLeft,
  ArrowRight,
  BrainCircuit,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Gauge,
  LineChart,
  LoaderCircle,
  ShieldAlert,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AuthControl } from "@/components/auth-control";
import { MagicBrainLogo } from "@/components/brand-logo";
import { LanguageToggle, useLanguage } from "@/components/language-provider";
import { SetSelector } from "@/components/set-selector";
import type { GrowthTarget } from "@/lib/predict-model";
import type { SetPrediction } from "@/lib/predict";
import styles from "./predict.module.css";

const targets: Array<{
  id: GrowthTarget;
  label: { en: string; es: string };
  rate: string;
  risk: { en: string; es: string };
}> = [
  { id: "inflation", label: { en: "Match inflation", es: "Igualar inflación" }, rate: "3% / year", risk: { en: "Lower bar", es: "Objetivo bajo" } },
  { id: "sp500", label: { en: "Match S&P 500", es: "Igualar S&P 500" }, rate: "8% / year", risk: { en: "Growth", es: "Crecimiento" } },
  { id: "extreme", label: { en: "Extreme risk & reward", es: "Riesgo y retorno extremos" }, rate: "20%+ / year", risk: { en: "Speculative", es: "Especulativo" } },
];

const signed = (value: number | null) =>
  value === null ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;

const spanishReasons: Record<string, string> = {
  "Strong expected collector demand": "Demanda de coleccionistas esperada alta",
  "Balanced demand assumption": "Supuesto de demanda equilibrada",
  "Constrained supply assumption": "Supuesto de oferta limitada",
  "Lower assumed reprint exposure": "Menor exposición estimada a reimpresiones",
  "Positive observed 90-day set momentum": "Momentum positivo observado a 90 días",
  "Broad participation across tracked cards": "Participación amplia entre las cartas monitorizadas",
  "Neutral assumptions": "Supuestos neutrales",
  "The set is unreleased; no live secondary-market history exists": "La edición aún no se ha lanzado y no tiene historial de mercado secundario",
  "Prediction is driven by assumptions rather than observed prices": "La predicción depende de supuestos, no de precios observados",
  "Weak demand assumption": "Supuesto de demanda débil",
  "High supply pressure assumption": "Supuesto de fuerte presión de oferta",
  "High reprint exposure assumption": "Supuesto de alta exposición a reimpresiones",
  "High observed price dispersion": "Alta dispersión de precios observada",
  "Low price-data coverage": "Cobertura de precios baja",
  "Card markets remain illiquid and can move abruptly": "El mercado de cartas sigue siendo ilíquido y puede moverse bruscamente",
};

export default function PredictPage() {
  const { locale, t } = useLanguage();
  const es = locale === "es";
  const [setCodes, setSetCodes] = useState<string[]>([]);
  const [target, setTarget] = useState<GrowthTarget>("sp500");
  const [horizon, setHorizon] = useState<12 | 24 | 36>(24);
  const [demand, setDemand] = useState(3);
  const [scarcity, setScarcity] = useState(3);
  const [reprints, setReprints] = useState(3);
  const [result, setResult] = useState<SetPrediction | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const requestUrl = useMemo(() => {
    const params = new URLSearchParams({
      target,
      horizon: String(horizon),
      demand: String(demand),
      scarcity: String(scarcity),
      reprints: String(reprints),
    });
    if (setCodes[0]) params.set("set", setCodes[0]);
    return `/api/predict?${params}`;
  }, [demand, horizon, reprints, scarcity, setCodes, target]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError("");
      fetch(requestUrl, { signal: controller.signal })
        .then(async (response) => {
          const payload = (await response.json()) as SetPrediction & { error?: string };
          if (!response.ok) throw new Error(payload.error ?? "Prediction unavailable");
          return payload;
        })
        .then(setResult)
        .catch((requestError: Error) => {
          if (requestError.name !== "AbortError") setError(requestError.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [requestUrl]);

  const prediction = result?.prediction;
  const verdict = prediction
    ? {
        favorable: es ? "Sí, escenario favorable" : "Yes, favorable scenario",
        watch: es ? "Vigilar antes de entrar" : "Watch before entering",
        speculative: es ? "Solo como apuesta especulativa" : "Speculative allocation only",
        unlikely: es ? "No con estos supuestos" : "Not with these assumptions",
      }[prediction.verdict]
    : "";
  const grade = prediction
    ? {
        "below-inflation": es ? "Por debajo de inflación" : "Below inflation",
        inflation: es ? "Iguala inflación" : "Matches inflation",
        sp500: es ? "Iguala S&P 500" : "Matches S&P 500",
        extreme: es ? "Riesgo y retorno extremos" : "Extreme risk & reward",
      }[prediction.growthGrade]
    : "";

  return (
    <main className={`account-page ${styles.page}`}>
      <header className="account-topbar">
        <Link href="/" className="inventory-brand"><MagicBrainLogo /></Link>
        <nav>
          <Link href="/predict" aria-current="page">Predict</Link>
          <Link href="/brain-pro">Brain Pro</Link>
          <Link href="/signals">Brain Signals</Link>
          <Link href="/market">{t("Market")}</Link>
        </nav>
        <LanguageToggle />
        <AuthControl compact />
        <Link href="/" className="back-dashboard"><ArrowLeft size={15} /> {t("Dashboard")}</Link>
      </header>

      <div className={styles.content}>
        <section className={styles.hero}>
          <div>
            <span className="pro-badge"><Sparkles size={13} /> BRAIN PRO · {es ? "GRATIS" : "FREE"}</span>
            <h1>Predict</h1>
            <p>
              {es
                ? "Evalúa si una edición puede encajar con tu objetivo de crecimiento mediante escenarios transparentes."
                : "Evaluate whether a set may fit your growth objective through transparent scenarios."}
            </p>
          </div>
          <SetSelector
            value={setCodes}
            onChange={setSetCodes}
            label={es ? "Edición a evaluar" : "Set to evaluate"}
            allLabel={es ? "Próxima edición disponible" : "Next available set"}
            placeholder={es ? "Busca Star Trek, código o edición…" : "Search Star Trek, code, or set…"}
          />
        </section>

        <aside className={styles.disclaimer}>
          <CircleAlert size={18} />
          <p>
            {es
              ? "Predict es un modelo de escenarios, no una predicción garantizada ni asesoramiento financiero. En ediciones futuras la confianza es necesariamente baja."
              : "Predict is a scenario model, not a guaranteed forecast or financial advice. Confidence is necessarily low for unreleased sets."}
          </p>
        </aside>

        <section className={styles.workspace}>
          <div className={styles.controls}>
            <div className={styles.sectionTitle}>
              <Target size={18} />
              <div><span>01</span><h2>{es ? "Objetivo de crecimiento" : "Growth objective"}</h2></div>
            </div>
            <div className={styles.targets}>
              {targets.map((option) => (
                <button
                  key={option.id}
                  className={target === option.id ? styles.active : ""}
                  onClick={() => setTarget(option.id)}
                >
                  <strong>{option.label[locale]}</strong>
                  <span>{option.rate}</span>
                  <small>{option.risk[locale]}</small>
                </button>
              ))}
            </div>

            <div className={styles.sectionTitle}>
              <CalendarDays size={18} />
              <div><span>02</span><h2>{es ? "Horizonte" : "Time horizon"}</h2></div>
            </div>
            <div className={styles.horizons}>
              {([12, 24, 36] as const).map((months) => (
                <button key={months} className={horizon === months ? styles.active : ""} onClick={() => setHorizon(months)}>
                  {months} {es ? "meses" : "months"}
                </button>
              ))}
            </div>

            <div className={styles.sectionTitle}>
              <Gauge size={18} />
              <div><span>03</span><h2>{es ? "Tu tesis" : "Your thesis"}</h2></div>
            </div>
            {[
              { label: es ? "Demanda esperada" : "Expected demand", value: demand, setter: setDemand },
              { label: es ? "Escasez de oferta" : "Supply scarcity", value: scarcity, setter: setScarcity },
              { label: es ? "Resistencia a reimpresiones" : "Reprint resilience", value: reprints, setter: setReprints },
            ].map((control) => (
              <label className={styles.slider} key={control.label}>
                <span><strong>{control.label}</strong><b>{control.value}/5</b></span>
                <input type="range" min="1" max="5" step="1" value={control.value} onChange={(event) => control.setter(Number(event.target.value))} />
              </label>
            ))}
          </div>

          <div className={styles.output} aria-live="polite" aria-busy={loading}>
            {loading && <div className={styles.loading}><LoaderCircle className="spin" size={25} /> {es ? "Calculando escenario…" : "Calculating scenario…"}</div>}
            {!loading && error && <div className={styles.error}><CircleAlert size={21} /> {error}</div>}
            {!loading && prediction && result && (
              <>
                <header>
                  <div>
                    <span>{result.set.code.toUpperCase()} · {result.set.setType}</span>
                    <h2>{result.set.name}</h2>
                    <small>
                      {result.marketEvidence.isUpcoming
                        ? `${es ? "Lanzamiento previsto" : "Expected release"} · ${result.set.releasedAt ?? "TBA"}`
                        : `${es ? "Datos hasta" : "Data through"} · ${result.asOf ?? "—"}`}
                    </small>
                  </div>
                  <div className={styles.score}><strong>{prediction.score}</strong><span>/100</span></div>
                </header>

                <div className={`${styles.verdict} ${styles[prediction.verdict]}`}>
                  {prediction.verdict === "favorable" ? <CheckCircle2 size={22} /> : <ShieldAlert size={22} />}
                  <div><span>{es ? "¿Merece la pena?" : "Is it worth watching?"}</span><strong>{verdict}</strong></div>
                </div>

                <div className={styles.metrics}>
                  <article><span>{es ? "Grado de growth" : "Growth grade"}</span><strong>{grade}</strong></article>
                  <article><span>{es ? "Probabilidad de objetivo" : "Target probability"}</span><strong>{prediction.probabilityOfTarget}%</strong><small>≥ {prediction.targetAnnualReturn}% / {es ? "año" : "year"}</small></article>
                  <article><span>{es ? "Confianza del modelo" : "Model confidence"}</span><strong>{prediction.confidence}%</strong><small>{result.marketEvidence.isUpcoming ? (es ? "Pre-lanzamiento" : "Pre-release") : `${result.marketEvidence.trackedCards} cards`}</small></article>
                </div>

                <section className={styles.range}>
                  <div><LineChart size={18} /><span>{horizon}M {es ? "rango de escenario" : "scenario range"}</span></div>
                  <div className={styles.rangeValues}>
                    <span><small>{es ? "Bajista" : "Bear"}</small><strong>{signed(prediction.horizonRange.low)}</strong></span>
                    <span><small>{es ? "Base" : "Base"}</small><strong>{signed(prediction.horizonRange.midpoint)}</strong></span>
                    <span><small>{es ? "Alcista" : "Bull"}</small><strong>{signed(prediction.horizonRange.high)}</strong></span>
                  </div>
                  <div className={styles.rangeTrack}><i style={{ left: `${prediction.confidence}%` }} /></div>
                </section>

                <div className={styles.evidence}>
                  <article><span>90D median</span><strong>{signed(result.marketEvidence.medianReturn90d)}</strong></article>
                  <article><span>90D breadth</span><strong>{signed(result.marketEvidence.breadth90d)}</strong></article>
                  <article><span>{es ? "Cobertura" : "Coverage"}</span><strong>{signed(result.marketEvidence.coveragePercent)}</strong></article>
                  <article><span>{es ? "Volatilidad" : "Volatility"}</span><strong>{signed(result.marketEvidence.volatility90d)}</strong></article>
                </div>

                <div className={styles.reasons}>
                  <div><h3>{es ? "Impulsores" : "Drivers"}</h3><ul>{prediction.drivers.map((item) => <li key={item}>{es ? spanishReasons[item] ?? item : item}</li>)}</ul></div>
                  <div><h3>{es ? "Riesgos" : "Risks"}</h3><ul>{prediction.risks.map((item) => <li key={item}>{es ? spanishReasons[item] ?? item : item}</li>)}</ul></div>
                </div>
                {!result.marketEvidence.isUpcoming && (
                  <Link className={styles.detailLink} href={`/market/latest-set-watch?set=${result.set.code}`}>
                    {es ? "Ver cartas de la edición" : "View cards in this set"} <ArrowRight size={15} />
                  </Link>
                )}
              </>
            )}
          </div>
        </section>

        <section className={styles.methodology}>
          <BrainCircuit size={20} />
          <div>
            <h2>{es ? "Cómo leer la predicción" : "How to read the prediction"}</h2>
            <p>{result?.methodology.forecastNote}</p>
            <small>{result?.methodology.benchmarkNote}</small>
          </div>
        </section>
      </div>
    </main>
  );
}
