"use client";

import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BrainCircuit,
  Check,
  Crown,
  Heart,
  LoaderCircle,
  MessageCircleQuestion,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AuthControl } from "@/components/auth-control";
import { MagicBrainLogo, MagicBrainMark } from "@/components/brand-logo";
import { LanguageToggle, useLanguage } from "@/components/language-provider";

type Account = {
  isPro: boolean;
  subscriptionStatus: string;
  hasBillingAccount: boolean;
};

export default function ProPage() {
  const { locale, t } = useLanguage();
  const es = locale === "es";
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/account")
      .then((response) => response.json())
      .then((result: Account) => setAccount(result))
      .catch(() => setAccount({
        isPro: false,
        subscriptionStatus: "free",
        hasBillingAccount: false,
      }));
  }, []);

  const hasManagedSubscription =
    account?.hasBillingAccount === true;
  const hasGrantedProAccess =
    account?.isPro === true && !account.hasBillingAccount;

  const continueWithPro = async () => {
    setLoading(true);
    setError("");

    try {
      if (hasGrantedProAccess) return;
      const endpoint = hasManagedSubscription
        ? "/api/stripe/portal"
        : "/api/stripe/checkout";
      const response = await fetch(endpoint, { method: "POST" });
      const result = (await response.json()) as { url?: string; error?: string };

      if (!response.ok || !result.url) {
        throw new Error(result.error ?? "Unable to open secure billing");
      }

      window.location.assign(result.url);
    } catch (checkoutError) {
      setError(
        checkoutError instanceof Error
          ? checkoutError.message
          : "Unable to open secure billing",
      );
      setLoading(false);
    }
  };

  const cta = hasGrantedProAccess
    ? es
      ? "Brain Pro activo"
      : "Brain Pro active"
    : hasManagedSubscription
    ? es
      ? "Gestionar suscripción"
      : "Manage subscription"
    : es
      ? "Probar Brain Pro gratis"
      : "Try Brain Pro free";

  const features = [
    {
      icon: SlidersHorizontal,
      title: es ? "Constructor de cartera" : "Portfolio Builder",
      copy: es
        ? "Convierte presupuesto, riesgo y preferencias en hasta 20 posiciones explicadas."
        : "Turn budget, risk, and preferences into up to 20 explained positions.",
    },
    {
      icon: Activity,
      title: "Brain Signals",
      copy: es
        ? "Lee el régimen, amplitud, volatilidad, índice de mercado y oportunidades priorizadas en 7, 30 y 90 días."
        : "Read market regime, breadth, volatility, index trends, and prioritised opportunities across 7, 30, and 90 days.",
    },
    {
      icon: MessageCircleQuestion,
      title: "Ask Brain",
      copy: es
        ? "Pregunta por fechas, duración y grandes movimientos usando el historial completo."
        : "Ask about dates, duration, and major moves using complete price history.",
    },
    {
      icon: Heart,
      title: "Brain Discovery",
      copy: es
        ? "Descubre cartas según tu perfil y guarda las mejores directamente en tu watchlist."
        : "Discover cards matched to your profile and save the strongest directly to your watchlist.",
    },
  ];

  return (
    <main className="pro-page">
      <header className="account-topbar pro-topbar">
        <Link href="/" className="inventory-brand"><MagicBrainLogo /></Link>
        <nav>
          <Link href="/brain">{es ? "Probar Brain" : "Try Brain"}</Link>
          <Link href="/signals">Brain Signals</Link>
          <Link href="/portfolio">{t("Portfolio")}</Link>
          <Link href="/market">{t("Market")}</Link>
        </nav>
        <LanguageToggle />
        <AuthControl compact />
        <Link href="/" className="back-dashboard"><ArrowLeft size={15} /> {t("Dashboard")}</Link>
      </header>

      <section className="pro-hero">
        <div className="pro-hero-glow" />
        <div className="pro-hero-copy">
          <span className="pro-badge"><Crown size={14} /> Magic Brain AI Pro</span>
          <h1>
            {es ? "De datos de mercado a una " : "Turn market data into a "}
            <span>{es ? "estrategia clara." : "clear strategy."}</span>
          </h1>
          <p>
            {es
              ? "Brain analiza precios históricos y convierte tus preferencias en una cartera de cartas concreta, diversificada y explicable."
              : "Brain analyses historical prices and turns your preferences into a concrete, diversified, and explainable card portfolio."}
          </p>
          <div className="pro-hero-actions">
            <button onClick={continueWithPro} disabled={loading || !account || hasGrantedProAccess}>
              {loading ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />}
              {loading ? (es ? "Abriendo Stripe…" : "Opening Stripe…") : cta}
              {!loading && <ArrowRight size={17} />}
            </button>
            <Link href="/brain">{es ? "Ver cómo funciona" : "See how it works"}</Link>
          </div>
          {!account?.isPro && (
            <div className="pro-price-line">
              <strong>€5</strong><span>/{es ? "mes" : "month"}</span>
              <i />
              <span>{es ? "14 días gratis · Cancela cuando quieras" : "14 days free · Cancel anytime"}</span>
            </div>
          )}
          {hasGrantedProAccess && (
            <div className="pro-price-line">
              <ShieldCheck size={15} />
              <span>{es ? "Tu acceso Pro está gestionado directamente por Magic Brain." : "Your Pro access is managed directly by Magic Brain."}</span>
            </div>
          )}
          {error && <div className="pro-error">{error}</div>}
        </div>

        <div className="pro-strategy-preview" aria-label={es ? "Vista previa de estrategia" : "Strategy preview"}>
          <span className="pro-strategy-preview-label">{es ? "VISTA PREVIA DEL PRODUCTO · CONSTRUCTOR DE CARTERA" : "PRODUCT PREVIEW · PORTFOLIO BUILDER"}</span>
          <div className="strategy-preview-head">
            <span><MagicBrainMark size={31} /></span>
            <div><small>AI PORTFOLIO</small><strong>{es ? "Estrategia equilibrada" : "Balanced strategy"}</strong></div>
            <em><i /> {es ? "Lista" : "Ready"}</em>
          </div>
          <div className="strategy-budget">
            <span>{es ? "Presupuesto asignado" : "Budget allocated"}</span>
            <strong>€1,000.00</strong>
            <small>12 {es ? "posiciones" : "positions"} · {es ? "riesgo medio" : "medium risk"}</small>
          </div>
          <div className="strategy-bars">
            <div><span>Commander staples</span><i><b style={{ width: "88%" }} /></i><strong>38%</strong></div>
            <div><span>Reserved List</span><i><b style={{ width: "64%" }} /></i><strong>27%</strong></div>
            <div><span>Premium printings</span><i><b style={{ width: "47%" }} /></i><strong>20%</strong></div>
            <div><span>{es ? "Reserva" : "Reserve"}</span><i><b style={{ width: "34%" }} /></i><strong>15%</strong></div>
          </div>
          <div className="strategy-note"><BrainCircuit size={16} /> {es ? "Cada posición incluye una explicación basada en tendencia." : "Every position includes a trend-based rationale."}</div>
        </div>
      </section>

      <section className="pro-proof">
        <div><strong>117K+</strong><span>{es ? "cartas y ediciones" : "cards and printings"}</span></div>
        <div><strong>9M+</strong><span>{es ? "observaciones de precio" : "price observations"}</span></div>
        <div><strong>7D / 30D</strong><span>{es ? "señales de tendencia" : "momentum signals"}</span></div>
        <div><strong>20</strong><span>{es ? "posiciones por estrategia" : "positions per strategy"}</span></div>
      </section>

      <section className="pro-section">
        <div className="pro-section-heading">
          <span className="eyebrow">{es ? "MENOS RUIDO. MÁS CLARIDAD." : "LESS NOISE. MORE CLARITY."}</span>
          <h2>{es ? "Tu criterio. Potenciado por datos." : "Your judgment. Powered by data."}</h2>
          <p>{es ? "Brain hace el trabajo pesado sin ocultarte cómo llega a cada selección." : "Brain does the heavy lifting without hiding how each selection was made."}</p>
        </div>
        <div className="pro-feature-grid">
          {features.map(({ icon: Icon, title, copy }, index) => (
            <article key={title}>
              <span>{index + 1}</span>
              <div className="pro-feature-icon"><Icon size={21} /></div>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="pro-workflow">
        <div>
          <span className="eyebrow">{es ? "DE LA IDEA A TU CARTERA" : "FROM IDEA TO PORTFOLIO"}</span>
          <h2>{es ? "Una decisión compleja en tres pasos." : "A complex decision in three steps."}</h2>
        </div>
        <ol>
          <li><span>01</span><div><strong>{es ? "Define tus límites" : "Set your boundaries"}</strong><p>{es ? "Presupuesto, riesgo y horizonte temporal." : "Budget, risk, and time horizon."}</p></div></li>
          <li><span>02</span><div><strong>{es ? "Revisa la tesis" : "Review the thesis"}</strong><p>{es ? "Entiende la tendencia y asignación de cada carta." : "Understand the trend and allocation behind each card."}</p></div></li>
          <li><span>03</span><div><strong>{es ? "Añade la estrategia" : "Add the strategy"}</strong><p>{es ? "Lleva todas las posiciones a tu cartera con un clic." : "Move every position into your portfolio in one click."}</p></div></li>
        </ol>
      </section>

      <section className="pro-comparison">
        <div className="pro-section-heading">
          <span className="eyebrow">{es ? "ELIGE TU NIVEL" : "CHOOSE YOUR LEVEL"}</span>
          <h2>{es ? "Explora el mercado. Desbloquea la estrategia." : "Explore the market. Unlock the strategy."}</h2>
        </div>
        <div className="plan-grid">
          <article>
            <span className="plan-name">Free</span>
            <strong>€0</strong>
            <p>{es ? "Para explorar el mercado y seguir tu colección." : "For exploring the market and tracking your collection."}</p>
            <ul>
              <li><Check size={15} /> {es ? "Catálogo y estadísticas de mercado" : "Market catalogue and statistics"}</li>
              <li><Check size={15} /> {es ? "Cartera y rendimiento histórico" : "Portfolio and historical performance"}</li>
              <li><Check size={15} /> {es ? "Watchlist con precios objetivo" : "Watchlist with target prices"}</li>
            </ul>
            <Link href="/market">{es ? "Explorar mercado" : "Explore market"}</Link>
          </article>
          <article className="featured">
            <span className="popular">{es ? "MÁS COMPLETO" : "FULL EXPERIENCE"}</span>
            <span className="plan-name">Brain Pro</span>
            <div><strong>€5</strong><span>/{es ? "mes" : "month"}</span></div>
            <p>{es ? "Para convertir tus criterios en una cartera completa." : "For turning your criteria into a complete portfolio."}</p>
            <ul>
              <li><Check size={15} /> {es ? "Hasta 20 posiciones diversificadas" : "Up to 20 diversified positions"}</li>
              <li><Check size={15} /> {es ? "Explicación y asignación por carta" : "Rationale and allocation per card"}</li>
              <li><Check size={15} /> {es ? "Brain Signals con amplitud, riesgo y zonas de vigilancia" : "Brain Signals with breadth, risk, and watch zones"}</li>
              <li><Check size={15} /> {es ? "Añadir la cartera completa en un clic" : "Add the complete portfolio in one click"}</li>
              <li><Check size={15} /> {es ? "Gestión de suscripción autoservicio" : "Self-service subscription management"}</li>
            </ul>
            <button onClick={continueWithPro} disabled={loading || !account || hasGrantedProAccess}>
              {account?.isPro ? cta : es ? "Empezar 14 días gratis" : "Start 14 days free"}
              <ArrowRight size={16} />
            </button>
            {!account?.isPro && <small>{es ? "Sin cargo hoy. Pago seguro con Stripe." : "No charge today. Secure checkout by Stripe."}</small>}
          </article>
        </div>
      </section>

      <section className="pro-final-cta">
        <div className="pro-final-mark"><MagicBrainMark size={52} /></div>
        <span className="eyebrow">MAGIC BRAIN AI PRO</span>
        <h2>{es ? "Invierte con una tesis, no con una corazonada." : "Invest with a thesis, not a hunch."}</h2>
        <p>{es ? "Construye tu primera estrategia completa en menos de dos minutos." : "Build your first complete strategy in under two minutes."}</p>
        <button onClick={continueWithPro} disabled={loading || !account || hasGrantedProAccess}>
          <WalletCards size={17} /> {cta} <ArrowRight size={16} />
        </button>
        {!account?.isPro && <span><ShieldCheck size={13} /> {es ? "14 días gratis · Después €5/mes · Cancela cuando quieras" : "14 days free · Then €5/month · Cancel anytime"}</span>}
      </section>

      <footer className="pro-footer">
        <MagicBrainLogo />
        <p>{es ? "Análisis de mercado, no asesoramiento financiero." : "Market analysis, not financial advice."}</p>
        <p className="creator-credit">
          {es ? "Creado por " : "Created by "}
          <a href="https://bizkardolab.com" target="_blank" rel="noreferrer">
            Asier Sarasua · BizkardoLab
          </a>
        </p>
      </footer>
    </main>
  );
}
