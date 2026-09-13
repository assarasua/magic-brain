"use client";

/* eslint-disable @next/next/no-img-element */

import {
  ArrowLeft,
  ArrowRight,
  Bell,
  BrainCircuit,
  CalendarDays,
  Check,
  CheckCircle2,
  CircleAlert,
  Gauge,
  LineChart,
  LoaderCircle,
  Plus,
  ShieldAlert,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AuthControl } from "@/components/auth-control";
import { MagicBrainLogo } from "@/components/brand-logo";
import { useCardDetail } from "@/components/card-detail-provider";
import { LanguageToggle, useLanguage } from "@/components/language-provider";
import { SetSelector } from "@/components/set-selector";
import type { BrainRecommendation } from "@/lib/brain";
import type { GrowthTarget } from "@/lib/predict-model";
import type { SetPrediction } from "@/lib/predict";
import {
  defaultUserPreferences,
  type UserPreferences,
} from "@/lib/user-preferences";
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

const riskProfiles: Array<{
  id: UserPreferences["risk"];
  label: { en: string; es: string };
}> = [
  { id: "preservation", label: { en: "Preservation", es: "Preservación" } },
  { id: "conservative", label: { en: "Conservative", es: "Conservador" } },
  { id: "balanced", label: { en: "Balanced", es: "Equilibrado" } },
  { id: "growth", label: { en: "Growth", es: "Crecimiento" } },
  { id: "aggressive", label: { en: "Aggressive", es: "Agresivo" } },
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

type AutomaticPortfolio = {
  id: string;
  name: string;
  budget: number;
  invested: number;
  expectedValue: number;
  recommendations: BrainRecommendation[];
};

export default function PredictPage() {
  const { locale, t } = useLanguage();
  const { cardSurfaceProps } = useCardDetail();
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
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [savingTo, setSavingTo] = useState<"portfolio" | "watchlist" | null>(
    null,
  );
  const [actionNotice, setActionNotice] = useState("");
  const [buildMode, setBuildMode] = useState<"manual" | "automatic">("manual");
  const [buyerProfile, setBuyerProfile] = useState<UserPreferences>(
    defaultUserPreferences,
  );
  const [autoBudget, setAutoBudget] = useState(
    defaultUserPreferences.defaultBudget,
  );
  const [autoRisk, setAutoRisk] = useState<UserPreferences["risk"]>(
    defaultUserPreferences.risk,
  );
  const [autoPortfolio, setAutoPortfolio] =
    useState<AutomaticPortfolio | null>(null);
  const [generatingPortfolio, setGeneratingPortfolio] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/account", { signal: controller.signal })
      .then((response) => response.json())
      .then((account: { preferences?: UserPreferences }) => {
        if (!account.preferences) return;
        setBuyerProfile(account.preferences);
        setAutoBudget(account.preferences.defaultBudget);
        setAutoRisk(account.preferences.risk);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

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
        .then((nextResult) => {
          setResult(nextResult);
          setSelectedCardIds(new Set());
          setAutoPortfolio(null);
          setActionNotice("");
        })
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
  const selectedPicks = useMemo(
    () =>
      result?.cardPredictions.filter((pick) =>
        selectedCardIds.has(pick.card.id),
      ) ?? [],
    [result, selectedCardIds],
  );
  const allCardsSelected =
    Boolean(result?.cardPredictions.length) &&
    selectedCardIds.size === result?.cardPredictions.length;

  const toggleCard = (cardId: string) => {
    setSelectedCardIds((current) => {
      const next = new Set(current);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
    setActionNotice("");
  };

  const toggleAllCards = () => {
    setSelectedCardIds(
      allCardsSelected
        ? new Set()
        : new Set(result?.cardPredictions.map((pick) => pick.card.id) ?? []),
    );
    setActionNotice("");
  };

  const addSelectedCards = async (destination: "portfolio" | "watchlist") => {
    if (selectedPicks.length === 0 || savingTo) return;
    setSavingTo(destination);
    setActionNotice("");

    const results = await Promise.all(
      selectedPicks.map(async (pick) => {
        if (destination === "portfolio" && pick.card.price === null) {
          return { id: pick.card.id, added: false };
        }
        try {
          const response = await fetch(
            destination === "portfolio" ? "/api/portfolio" : "/api/watchlist",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(
                destination === "portfolio"
                  ? {
                      cardId: pick.card.id,
                      quantity: 1,
                      purchasePrice: pick.card.price,
                      condition: "near_mint",
                      language: "en",
                    }
                  : { cardId: pick.card.id },
              ),
            },
          );
          return { id: pick.card.id, added: response.ok };
        } catch {
          return { id: pick.card.id, added: false };
        }
      }),
    );

    const addedIds = new Set(
      results.filter((item) => item.added).map((item) => item.id),
    );
    setSelectedCardIds((current) => {
      const next = new Set(current);
      addedIds.forEach((id) => next.delete(id));
      return next;
    });
    setActionNotice(
      addedIds.size === selectedPicks.length
        ? destination === "portfolio"
          ? es
            ? `${addedIds.size} cartas añadidas a tu cartera.`
            : `${addedIds.size} cards added to your portfolio.`
          : es
            ? `${addedIds.size} cartas añadidas a tu watchlist.`
            : `${addedIds.size} cards added to your watchlist.`
        : es
          ? `Se añadieron ${addedIds.size} de ${selectedPicks.length} cartas. Revisa las cartas sin precio e inténtalo de nuevo.`
          : `${addedIds.size} of ${selectedPicks.length} cards were added. Review cards without prices and try again.`,
    );
    setSavingTo(null);
  };

  const generateAutomaticPortfolio = async () => {
    if (!result || generatingPortfolio) return;
    setGeneratingPortfolio(true);
    setActionNotice("");
    try {
      const response = await fetch("/api/predict/portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          setCode: result.set.code,
          budget: autoBudget,
          risk: autoRisk,
          locale,
        }),
      });
      const payload = (await response.json()) as AutomaticPortfolio & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to generate portfolio");
      }
      setAutoPortfolio(payload);
      setActionNotice(
        es
          ? `Cartera automática generada con ${payload.recommendations.length} posiciones.`
          : `Automatic portfolio generated with ${payload.recommendations.length} positions.`,
      );
    } catch (generationError) {
      setAutoPortfolio(null);
      setActionNotice(
        generationError instanceof Error
          ? generationError.message
          : es
            ? "No se pudo generar la cartera."
            : "Unable to generate the portfolio.",
      );
    } finally {
      setGeneratingPortfolio(false);
    }
  };

  const saveAutomaticPortfolio = async (
    destination: "portfolio" | "watchlist",
  ) => {
    if (!autoPortfolio?.recommendations.length || savingTo) return;
    setSavingTo(destination);
    setActionNotice("");
    const requests = autoPortfolio.recommendations.map(async (item) => {
      try {
        const response = await fetch(
          destination === "portfolio" ? "/api/portfolio" : "/api/watchlist",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              destination === "portfolio"
                ? {
                    cardId: item.cardId,
                    quantity: item.quantity,
                    purchasePrice: item.price,
                    condition: "near_mint",
                    language: "en",
                  }
                : { cardId: item.cardId },
            ),
          },
        );
        return response.ok;
      } catch {
        return false;
      }
    });
    const saved = (await Promise.all(requests)).filter(Boolean).length;
    const total = autoPortfolio.recommendations.length;
    setActionNotice(
      saved === total
        ? destination === "portfolio"
          ? es
            ? "La cartera automática se ha añadido a tus posiciones."
            : "The automatic portfolio was added to your holdings."
          : es
            ? "La lista automática se ha añadido a tu watchlist."
            : "The automatic list was added to your watchlist."
        : es
          ? `Se añadieron ${saved} de ${total} posiciones.`
          : `${saved} of ${total} positions were added.`,
    );
    setSavingTo(null);
  };

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

        <section className={styles.cardSection}>
          <div className={styles.cardSectionHead}>
            <div>
              <span className="eyebrow">{es ? "PREDICCIONES POR CARTA" : "CARD PREDICTIONS"}</span>
              <h2>{es ? "Lista generada para esta edición" : "Generated list for this set"}</h2>
            </div>
            {result && !result.marketEvidence.isUpcoming && (
              <Link href={`/market/latest-set-watch?set=${result.set.code}`}>
                {es ? "Ver ranking completo" : "View full ranking"} <ArrowRight size={15} />
              </Link>
            )}
          </div>

          <div className={styles.buildMode}>
            <button
              type="button"
              className={buildMode === "manual" ? styles.active : ""}
              onClick={() => setBuildMode("manual")}
            >
              <Check size={14} />
              {es ? "Selección manual" : "Manual selection"}
            </button>
            <button
              type="button"
              className={buildMode === "automatic" ? styles.active : ""}
              onClick={() => setBuildMode("automatic")}
            >
              <Sparkles size={14} />
              {es ? "Cartera automática con AI" : "Automatic AI portfolio"}
            </button>
          </div>

          {buildMode === "manual" && Boolean(result?.cardPredictions.length) && (
            <div className={styles.selectionBar}>
              <div>
                <button type="button" onClick={toggleAllCards}>
                  {allCardsSelected ? <Check size={14} /> : <Plus size={14} />}
                  {allCardsSelected
                    ? (es ? "Deseleccionar todo" : "Clear selection")
                    : (es ? "Seleccionar todo" : "Select all")}
                </button>
                <span>
                  <strong>{selectedCardIds.size}</strong>{" "}
                  {es ? "cartas seleccionadas" : "cards selected"}
                </span>
              </div>
              <div>
                <button
                  type="button"
                  disabled={selectedPicks.length === 0 || savingTo !== null}
                  onClick={() => void addSelectedCards("portfolio")}
                >
                  {savingTo === "portfolio" ? <LoaderCircle className="spin" size={14} /> : <Plus size={14} />}
                  {es ? "Añadir a cartera" : "Add to portfolio"}
                </button>
                <button
                  type="button"
                  disabled={selectedPicks.length === 0 || savingTo !== null}
                  onClick={() => void addSelectedCards("watchlist")}
                >
                  {savingTo === "watchlist" ? <LoaderCircle className="spin" size={14} /> : <Bell size={14} />}
                  {es ? "Añadir a watchlist" : "Add to watchlist"}
                </button>
              </div>
            </div>
          )}

          {buildMode === "automatic" && result && !result.marketEvidence.isUpcoming && (
            <div className={styles.autoBuilder}>
              <div className={styles.autoControls}>
                <div>
                  <span className="eyebrow">{es ? "PERFIL DEL COMPRADOR" : "BUYER PROFILE"}</span>
                  <h3>{es ? "Brain construye la asignación" : "Brain builds the allocation"}</h3>
                  <p>
                    {es
                      ? `Parte de tus preferencias guardadas: máximo ${buyerProfile.maxCardPrice.toFixed(0)} € por carta y hasta ${buyerProfile.positions} posiciones.`
                      : `Starts from your saved preferences: up to €${buyerProfile.maxCardPrice.toFixed(0)} per card and ${buyerProfile.positions} positions.`}
                  </p>
                </div>
                <label>
                  {es ? "Riesgo" : "Risk"}
                  <select
                    value={autoRisk}
                    onChange={(event) => {
                      setAutoRisk(event.target.value as UserPreferences["risk"]);
                      setAutoPortfolio(null);
                    }}
                  >
                    {riskProfiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.label[locale]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {es ? "Presupuesto" : "Budget"}
                  <span className={styles.moneyInput}>
                    €{" "}
                    <input
                      type="number"
                      min="25"
                      max="1000000"
                      value={autoBudget}
                      onChange={(event) => {
                        setAutoBudget(Number(event.target.value));
                        setAutoPortfolio(null);
                      }}
                    />
                  </span>
                </label>
                <button
                  type="button"
                  disabled={generatingPortfolio || autoBudget < 25}
                  onClick={() => void generateAutomaticPortfolio()}
                >
                  {generatingPortfolio ? <LoaderCircle className="spin" size={15} /> : <Sparkles size={15} />}
                  {es ? "Generar cartera" : "Generate portfolio"}
                </button>
              </div>

              {autoPortfolio && (
                <div className={styles.autoResult}>
                  <header>
                    <div>
                      <span>{es ? "LISTA AI GUARDADA" : "SAVED AI LIST"}</span>
                      <h3>{autoPortfolio.name} · {result.set.name}</h3>
                    </div>
                    <div>
                      <strong>€{autoPortfolio.invested.toFixed(2)}</strong>
                      <small>{es ? `de €${autoPortfolio.budget.toFixed(2)}` : `of €${autoPortfolio.budget.toFixed(2)}`}</small>
                    </div>
                  </header>
                  {autoPortfolio.recommendations.length === 0 ? (
                    <div className={styles.autoEmpty}>
                      {es
                        ? "No hay cartas que cumplan este perfil. Amplía el presupuesto o cambia el riesgo."
                        : "No cards match this profile. Increase the budget or change the risk."}
                    </div>
                  ) : (
                    <>
                      <div className={styles.autoList}>
                        {autoPortfolio.recommendations.map((item, index) => (
                          <article key={item.cardId} className="card-surface" {...cardSurfaceProps(item.cardId)}>
                            <span>{String(index + 1).padStart(2, "0")}</span>
                            {item.imageUrl && <img src={item.imageUrl} alt="" />}
                            <div>
                              <strong>{item.name}</strong>
                              <small>{item.quantity}× · €{item.price.toFixed(2)} · score {item.score}</small>
                            </div>
                            <b>€{item.allocation.toFixed(2)}</b>
                          </article>
                        ))}
                      </div>
                      <div className={styles.autoActions}>
                        <button
                          type="button"
                          disabled={savingTo !== null}
                          onClick={() => void saveAutomaticPortfolio("portfolio")}
                        >
                          {savingTo === "portfolio" ? <LoaderCircle className="spin" size={14} /> : <Plus size={14} />}
                          {es ? "Añadir cartera completa" : "Add complete portfolio"}
                        </button>
                        <button
                          type="button"
                          disabled={savingTo !== null}
                          onClick={() => void saveAutomaticPortfolio("watchlist")}
                        >
                          {savingTo === "watchlist" ? <LoaderCircle className="spin" size={14} /> : <Bell size={14} />}
                          {es ? "Añadir lista a watchlist" : "Add list to watchlist"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
          {actionNotice && <div className={styles.actionNotice}><CheckCircle2 size={15} /> {actionNotice}</div>}

          {!loading && result?.cardPredictions.length === 0 && (
            <div className={styles.noCards}>
              <CircleAlert size={20} />
              <div>
                <strong>
                  {result.marketEvidence.isUpcoming
                    ? (es ? "Aún no hay predicciones fiables por carta." : "Reliable card-level predictions are not available yet.")
                    : (es ? "No hay suficientes precios por carta." : "There is not enough card-level price data.")}
                </strong>
                <p>
                  {result.marketEvidence.isUpcoming
                    ? (es ? `El catálogo conoce ${result.set.cardCount} cartas previstas, pero esperaremos a tener cartas importadas y precios observados para puntuarlas.` : `The catalogue reports ${result.set.cardCount} expected cards, but scoring waits for imported cards and observed prices.`)
                    : (es ? "La predicción de la edición sigue disponible, pero no inventamos estimaciones para cartas sin historial." : "The set scenario remains available, but we do not invent estimates for cards without history.")}
                </p>
              </div>
            </div>
          )}

          {buildMode === "manual" && <div className={styles.cardGrid}>
            {result?.cardPredictions.map((pick, index) => (
              <article
                className={`card-surface ${selectedCardIds.has(pick.card.id) ? styles.selectedCard : ""}`}
                key={pick.card.id}
                {...cardSurfaceProps(pick.card)}
              >
                <div className={styles.cardImage}>
                  {pick.card.imageUrl ? <img src={pick.card.imageUrl} alt="" /> : <span>No image</span>}
                  <b>#{index + 1}</b>
                  <button
                    type="button"
                    className={styles.cardSelector}
                    aria-label={`${selectedCardIds.has(pick.card.id) ? (es ? "Deseleccionar" : "Deselect") : (es ? "Seleccionar" : "Select")} ${pick.card.name}`}
                    aria-pressed={selectedCardIds.has(pick.card.id)}
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleCard(pick.card.id);
                    }}
                  >
                    {selectedCardIds.has(pick.card.id) ? <Check size={15} /> : <Plus size={15} />}
                  </button>
                </div>
                <div className={styles.cardCopy}>
                  <span>{pick.card.rarity} · {pick.card.setCode.toUpperCase()}</span>
                  <h3>{pick.card.name}</h3>
                  <div>
                    <strong>{pick.score.total}/100</strong>
                    <em>{pick.score.risk} risk</em>
                    <b>{signed(pick.momentum30d)} 30D</b>
                  </div>
                  <p>{pick.rationale[0]}</p>
                </div>
              </article>
            ))}
          </div>}
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
