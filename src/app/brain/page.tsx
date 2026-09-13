"use client";

/* eslint-disable @next/next/no-img-element */

import {
  ArrowLeft,
  ArrowRight,
  BrainCircuit,
  Check,
  Crown,
  Lightbulb,
  LoaderCircle,
  Plus,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { LanguageToggle, useLanguage } from "@/components/language-provider";
import { AuthControl } from "@/components/auth-control";
import { MagicBrainLogo } from "@/components/brand-logo";
import { useCardDetail } from "@/components/card-detail-provider";
import { SetSelector } from "@/components/set-selector";
import type { BrainPreferences, BrainRecommendation } from "@/lib/brain";
import { CARD_COLORS, CARD_RARITIES, CARD_TYPES } from "@/lib/card-filters";
import { formatCurrency } from "@/lib/data";
import { defaultUserPreferences, type UserPreferences } from "@/lib/user-preferences";

type BrainResult = {
  id: string;
  name: string;
  isPreview: boolean;
  budget: number;
  invested: number;
  expectedValue: number;
  recommendations: BrainRecommendation[];
};

const colorOptions = CARD_COLORS.map((value) => ({
  value,
  label: { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green" }[value],
  symbol: { W: "☀", U: "💧", B: "●", R: "🔥", G: "🌿" }[value],
}));

export default function BrainPage() {
  const { locale, t } = useLanguage();
  const { cardSurfaceProps } = useCardDetail();
  const [risk, setRisk] = useState<BrainPreferences["risk"]>("balanced");
  const [horizon, setHorizon] = useState<"short" | "medium" | "long">("medium");
  const [strategy, setStrategy] = useState<BrainPreferences["strategy"]>("diversified");
  const [marketTrend, setMarketTrend] = useState<BrainPreferences["marketTrend"]>("any");
  const [releaseEra, setReleaseEra] = useState<BrainPreferences["releaseEra"]>("any");
  const [colors, setColors] = useState<string[]>([]);
  const [rarities, setRarities] = useState<string[]>(["rare", "mythic"]);
  const [cardTypes, setCardTypes] = useState<string[]>([]);
  const [setCodes, setSetCodes] = useState<string[]>([]);
  const [reservedOnly, setReservedOnly] = useState(false);
  const [budget, setBudget] = useState(defaultUserPreferences.defaultBudget);
  const [maxCardPrice, setMaxCardPrice] = useState(defaultUserPreferences.maxCardPrice);
  const [positions, setPositions] = useState(defaultUserPreferences.positions);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<BrainResult | null>(null);
  const [error, setError] = useState("");
  const [portfolioNotice, setPortfolioNotice] = useState("");

  const toggle = (value: string, values: string[], setter: (values: string[]) => void) =>
    setter(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);

  useEffect(() => {
    fetch("/api/account")
      .then((response) => response.json())
      .then((account: { preferences?: UserPreferences }) => {
        if (!account.preferences) return;
        const preferences = account.preferences;
        setRisk(preferences.risk);
        setHorizon(preferences.horizon);
        setStrategy(preferences.strategy);
        setMarketTrend(preferences.marketTrend);
        setReleaseEra(preferences.releaseEra);
        setColors(preferences.colors);
        setRarities(preferences.rarities);
        setCardTypes(preferences.cardTypes);
        setSetCodes(preferences.setCodes);
        setReservedOnly(preferences.reservedOnly);
        setBudget(preferences.defaultBudget);
        setMaxCardPrice(preferences.maxCardPrice);
        setPositions(preferences.positions);
      })
      .catch(() => undefined);
  }, []);

  const generate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setGenerating(true);
    setError("");
    const response = await fetch("/api/brain/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        budget,
        maxCardPrice,
        positions,
        risk,
        horizon,
        strategy,
        marketTrend,
        releaseEra,
        colors,
        rarities,
        cardTypes,
        setCodes,
        reservedOnly,
        locale,
      }),
    });
    const payload = await response.json();
    if (response.ok) setResult(payload as BrainResult);
    else setError(payload.error ?? "Unable to generate portfolio");
    setGenerating(false);
  };

  const addRecommendation = async (item: BrainRecommendation) => {
    await fetch("/api/portfolio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cardId: item.cardId,
        quantity: item.quantity,
        purchasePrice: item.price,
        condition: "near_mint",
        language: "en",
      }),
    });
    setPortfolioNotice(
      locale === "es" ? "Posición añadida a tu cartera" : "Position added to your portfolio",
    );
    window.setTimeout(() => setPortfolioNotice(""), 2200);
  };

  const addAllRecommendations = async () => {
    if (!result) return;
    await Promise.all(result.recommendations.map(addRecommendation));
    setPortfolioNotice(
      locale === "es" ? "Cartera completa añadida" : "Complete portfolio added",
    );
  };

  return (
    <main className="brain-page">
      <header className="account-topbar">
        <Link href="/" className="inventory-brand"><MagicBrainLogo /></Link>
        <nav><Link href="/signals">Brain Signals</Link><Link href="/inventory">{t("Inventory")}</Link><Link href="/portfolio">{t("Portfolio")}</Link></nav>
        <LanguageToggle />
        <AuthControl compact />
        <Link href="/" className="back-dashboard"><ArrowLeft size={15} /> {t("Dashboard")}</Link>
      </header>

      <div className="brain-hero">
        <div className="brain-orb"><BrainCircuit size={42} /><i /><i /></div>
        <span className="pro-pill"><Sparkles size={13} /> Brain Pro · {locale === "es" ? "Gratis" : "Free"}</span>
        <h1>{locale === "es" ? "Tu estratega de inversión en Magic." : "Your Magic investment strategist."}</h1>
        <p>{locale === "es" ? "Define tus objetivos. Brain analiza millones de precios históricos y construye una cartera diversificada para ti." : "Set your goals. Brain analyses millions of historical prices and builds a diversified card portfolio for you."}</p>
      </div>

      <div className="brain-layout">
        <form className="brain-form fintech-panel" onSubmit={generate}>
          <div className="section-title"><div><span className="eyebrow">{locale === "es" ? "Tu estrategia" : "Your strategy"}</span><h2>{locale === "es" ? "Preferencias de inversión" : "Investment preferences"}</h2></div><ShieldCheck size={20} /></div>

          <div className="brain-field">
            <label>{t("Investment budget")}</label>
            <div className="money-input"><span>€</span><input name="budget" type="number" min="25" max="1000000" value={budget} onChange={(event) => setBudget(Number(event.target.value))} required /></div>
          </div>

          <div className="brain-field">
            <label>{t("Risk profile")}</label>
            <div className="choice-grid five">
              {(["preservation", "conservative", "balanced", "growth", "aggressive"] as const).map((value, index) => (
                <button type="button" key={value} className={risk === value ? "active" : ""} onClick={() => setRisk(value)}>
                  <span>{["○", "◔", "◑", "◕", "●"][index]}</span>
                  <strong>{locale === "es" ? {
                    preservation: "Preservación",
                    conservative: "Conservador",
                    balanced: "Equilibrado",
                    growth: "Crecimiento",
                    aggressive: "Agresivo",
                  }[value] : `${value[0].toUpperCase()}${value.slice(1)}`}</strong>
                </button>
              ))}
            </div>
          </div>

          <div className="brain-field">
            <label>{t("Time horizon")}</label>
            <div className="choice-grid three">
              {(["short", "medium", "long"] as const).map((value) => (
                <button type="button" key={value} className={horizon === value ? "active" : ""} onClick={() => setHorizon(value)}>
                  <strong>{t(`${value[0].toUpperCase()}${value.slice(1)} term`)}</strong>
                  <small>{value === "short" ? "< 6m" : value === "medium" ? "6–18m" : "18m+"}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="brain-field">
            <label>{locale === "es" ? "Enfoque de inversión" : "Investment approach"}</label>
            <div className="choice-grid strategy">
              {(["diversified", "momentum", "stability", "collectible"] as const).map((value) => (
                <button type="button" key={value} className={strategy === value ? "active" : ""} onClick={() => setStrategy(value)}>
                  <strong>{locale === "es" ? {
                    diversified: "Diversificado",
                    momentum: "Momentum",
                    stability: "Estabilidad",
                    collectible: "Coleccionismo",
                  }[value] : `${value[0].toUpperCase()}${value.slice(1)}`}</strong>
                </button>
              ))}
            </div>
          </div>

          <div className="brain-field split">
            <label>{locale === "es" ? "Tendencia objetivo" : "Target trend"}
              <select value={marketTrend} onChange={(event) => setMarketTrend(event.target.value as BrainPreferences["marketTrend"])}>
                <option value="any">{locale === "es" ? "Cualquier tendencia" : "Any trend"}</option>
                <option value="rising">{locale === "es" ? "Subida confirmada" : "Confirmed growth"}</option>
                <option value="stable">{locale === "es" ? "Precio estable" : "Stable pricing"}</option>
                <option value="recovering">{locale === "es" ? "En recuperación" : "Recovering"}</option>
              </select>
            </label>
            <label>{locale === "es" ? "Época de edición" : "Release era"}
              <select value={releaseEra} onChange={(event) => setReleaseEra(event.target.value as BrainPreferences["releaseEra"])}>
                <option value="any">{locale === "es" ? "Todas las épocas" : "All eras"}</option>
                <option value="classic">{locale === "es" ? "Clásica · antes de 2004" : "Classic · before 2004"}</option>
                <option value="established">{locale === "es" ? "Consolidada · 2004–2018" : "Established · 2004–2018"}</option>
                <option value="recent">{locale === "es" ? "Reciente · 2019+" : "Recent · 2019+"}</option>
              </select>
            </label>
          </div>

          <div className="brain-field">
            <label>{locale === "es" ? "Preferencia de color" : "Colour preference"} <small>{locale === "es" ? "opcional" : "optional"}</small></label>
            <div className="mana-choices">
              {colorOptions.map((option) => <button type="button" key={option.value} title={option.label} className={colors.includes(option.value) ? "active" : ""} onClick={() => toggle(option.value, colors, setColors)}>{option.symbol}</button>)}
            </div>
          </div>

          <div className="brain-field">
            <label>{t("Rarity")}</label>
            <div className="check-row">
              {CARD_RARITIES.map((value) => <button type="button" key={value} className={rarities.includes(value) ? "active" : ""} onClick={() => toggle(value, rarities, setRarities)}>{rarities.includes(value) && <Check size={12} />}{value}</button>)}
            </div>
          </div>

          <div className="brain-field">
            <label>{locale === "es" ? "Tipos de carta" : "Card types"}</label>
            <div className="check-row">
              {CARD_TYPES.map((value) => <button type="button" key={value} className={cardTypes.includes(value) ? "active" : ""} onClick={() => toggle(value, cardTypes, setCardTypes)}>{cardTypes.includes(value) && <Check size={12} />}{value}</button>)}
            </div>
          </div>

          <div className="brain-field">
            <SetSelector
              value={setCodes}
              onChange={setSetCodes}
              multiple
              label={locale === "es" ? "Ediciones" : "Sets"}
              allLabel={locale === "es" ? "Todas las ediciones" : "All sets"}
            />
          </div>

          <div className="brain-field split">
            <label>{t("Maximum per card")}<div className="money-input"><span>€</span><input name="maxCardPrice" type="number" min="2" value={maxCardPrice} onChange={(event) => setMaxCardPrice(Number(event.target.value))} /></div></label>
            <label>{t("Number of positions")}<input name="positions" type="number" min="3" max="20" value={positions} onChange={(event) => setPositions(Number(event.target.value))} /></label>
          </div>

          <button type="button" className={reservedOnly ? "reserved-switch active" : "reserved-switch"} onClick={() => setReservedOnly(!reservedOnly)}>
            <span><Crown size={15} /></span><div><strong>{t("Reserved List only")}</strong><small>{locale === "es" ? "Activos de oferta fija" : "Fixed-supply assets only"}</small></div><i />
          </button>

          <button className="brain-generate" disabled={generating}>
            {generating ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />}
            {generating ? t("Building your portfolio…") : t("Generate portfolio")}
            {!generating && <ArrowRight size={16} />}
          </button>
          {error && <div className="inline-error">{error}</div>}
        </form>

        <section className="brain-output fintech-panel">
          {!result ? (
            <div className="brain-empty"><div><BrainCircuit size={42} /></div><h2>{locale === "es" ? "Listo cuando tú lo estés." : "Ready when you are."}</h2><p>{locale === "es" ? "Configura tus preferencias para recibir una cartera basada en tendencias reales, riesgo y diversificación." : "Set your preferences to receive a portfolio based on real trends, risk, and diversification."}</p><ul><li><Check size={13} /> 9M+ daily price observations</li><li><Check size={13} /> Explainable scoring</li><li><Check size={13} /> Position sizing by budget</li></ul></div>
          ) : (
            <div className="brain-result">
              <div className="brain-result-head"><div><span className="eyebrow">Brain Pro strategy</span><h2>{result.name}</h2></div><div className="result-head-actions"><span className="confidence"><i /> {locale === "es" ? "Confianza alta" : "High confidence"}</span><button onClick={addAllRecommendations}><Plus size={13} /> {locale === "es" ? "Añadir todo" : "Add all"}</button></div></div>
              <div className="brain-stats"><div><span>{locale === "es" ? "Presupuesto" : "Budget"}</span><strong>{formatCurrency(result.budget)}</strong></div><div><span>{locale === "es" ? "Asignado" : "Allocated"}</span><strong>{formatCurrency(result.invested)}</strong></div><div><span>{locale === "es" ? "Valor proyectado*" : "Projected value*"}</span><strong className="up">{formatCurrency(result.expectedValue)}</strong></div></div>
              <div className="recommendations">
                {result.recommendations.map((item, index) => <article className="card-surface" key={item.cardId} {...cardSurfaceProps(item.cardId)}>
                  <span className="recommendation-rank">{String(index + 1).padStart(2, "0")}</span>
                  {item.imageUrl && <img src={item.imageUrl} alt="" />}
                  <div className="recommendation-copy">
                    <strong>{item.name}</strong>
                    <span>{item.setCode.toUpperCase()} · {item.quantity}× · {formatCurrency(item.allocation)}</span>
                    <p>{item.rationale}</p>
                    <div className="buyer-tips">
                      <b><Lightbulb size={13} /> {locale === "es" ? "Consejos de compra" : "Buyer tips"}</b>
                      <ul>{item.buyerTips.map((tip) => <li key={tip}>{tip}</li>)}</ul>
                    </div>
                  </div>
                  <div className="recommendation-signal"><TrendingUp size={13} /><strong>+{item.change30d.toFixed(1)}%</strong><span>30D</span></div>
                  <button onClick={() => addRecommendation(item)} title={t("Add holding")}><Plus size={15} /></button>
                </article>)}
              </div>
              <p className="brain-disclaimer">*Projection applies the previous 30-day movement and is not a guarantee of future performance. This is market analysis, not financial advice.</p>
            </div>
          )}
        </section>
      </div>
      {portfolioNotice && <div className="toast">{portfolioNotice}</div>}
    </main>
  );
}
