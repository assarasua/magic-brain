"use client";

import {
  ArrowLeft,
  ArrowRight,
  BrainCircuit,
  Check,
  Crown,
  Heart,
  LockKeyhole,
  MessageCircleQuestion,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AuthControl } from "@/components/auth-control";
import { MagicBrainLogo, MagicBrainMark } from "@/components/brand-logo";
import { LanguageToggle, useLanguage } from "@/components/language-provider";

const tools = [
  {
    href: "/brain",
    icon: BrainCircuit,
    name: "Portfolio Builder",
    title: {
      en: "Build a portfolio around your investment thesis.",
      es: "Construye una cartera alrededor de tu tesis de inversión.",
    },
    copy: {
      en: "Turn budget, risk, horizon, colours, rarity, and market preferences into an explainable allocation.",
      es: "Convierte presupuesto, riesgo, horizonte, colores, rareza y preferencias de mercado en una asignación explicable.",
    },
    features: {
      en: ["Up to 20 positions", "Position sizing", "Buyer tips"],
      es: ["Hasta 20 posiciones", "Tamaño de posición", "Consejos de compra"],
    },
  },
  {
    href: "/signals",
    icon: TrendingUp,
    name: "Brain Signals",
    title: {
      en: "Read the market before taking a position.",
      es: "Lee el mercado antes de tomar una posición.",
    },
    copy: {
      en: "Track market regimes, breadth, volatility, momentum, risk scores, and practical watch zones.",
      es: "Sigue regímenes, amplitud, volatilidad, impulso, puntuaciones de riesgo y zonas de vigilancia.",
    },
    features: {
      en: ["7D / 30D / 90D index", "Market breadth", "Entry watch zones"],
      es: ["Índice 7D / 30D / 90D", "Amplitud de mercado", "Zonas de entrada"],
    },
  },
  {
    href: "/analyst",
    icon: MessageCircleQuestion,
    name: "Ask Brain",
    title: {
      en: "Interrogate complete price histories.",
      es: "Consulta historiales completos de precios.",
    },
    copy: {
      en: "Ask when a move happened, how long it lasted, and where the largest daily change occurred.",
      es: "Pregunta cuándo ocurrió un movimiento, cuánto duró y dónde estuvo el mayor cambio diario.",
    },
    features: {
      en: ["Natural language", "Key dates", "Evidence-based answers"],
      es: ["Lenguaje natural", "Fechas clave", "Respuestas con datos"],
    },
  },
  {
    href: "/discover",
    icon: Heart,
    name: "Brain Discovery",
    title: {
      en: "Discover opportunities matched to your profile.",
      es: "Descubre oportunidades adaptadas a tu perfil.",
    },
    copy: {
      en: "Review a focused card feed, understand the match rationale, and save candidates to your watchlist.",
      es: "Revisa una selección enfocada, entiende la afinidad y guarda candidatas en tu watchlist.",
    },
    features: {
      en: ["Personal match score", "Fast card review", "Watchlist workflow"],
      es: ["Puntuación personal", "Revisión rápida", "Flujo a watchlist"],
    },
  },
] as const;

export default function BrainProHubPage() {
  const { locale, t } = useLanguage();
  const es = locale === "es";
  const [isPro, setIsPro] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/account", { cache: "no-store" })
      .then((response) => response.json())
      .then((account: { isPro: boolean }) => setIsPro(account.isPro))
      .catch(() => setIsPro(false));
  }, []);

  return (
    <main className="account-page brain-pro-hub">
      <header className="account-topbar">
        <Link href="/" className="inventory-brand"><MagicBrainLogo /></Link>
        <nav><Link href="/signals">Brain Signals</Link><Link href="/portfolio">{t("Portfolio")}</Link><Link href="/pro">{es ? "Plan Pro" : "Pro plan"}</Link></nav>
        <LanguageToggle />
        <AuthControl compact />
        <Link href="/" className="back-dashboard"><ArrowLeft size={15} /> {t("Dashboard")}</Link>
      </header>

      <div className="brain-pro-hub-content">
        <section className="brain-pro-hub-hero">
          <div className="brain-pro-hub-mark"><MagicBrainMark size={54} /></div>
          <span className="pro-badge"><Crown size={14} /> MAGIC BRAIN AI PRO</span>
          <h1>{es ? "Todas tus herramientas de inversión. Un solo cerebro." : "Every investment tool. One intelligent workspace."}</h1>
          <p>{es ? "Investiga el mercado, genera una estrategia, valida oportunidades y descubre nuevas cartas desde un único centro." : "Research the market, build a strategy, validate opportunities, and discover new cards from one command centre."}</p>
          <span className={`brain-pro-status ${isPro ? "active" : ""}`}>
            {isPro ? <Check size={13} /> : <LockKeyhole size={13} />}
            {isPro === null
              ? es ? "Comprobando acceso…" : "Checking access…"
              : isPro
                ? es ? "Brain Pro activo" : "Brain Pro active"
                : es ? "Plan Basic · Funciones bloqueadas" : "Basic plan · Features locked"}
          </span>
        </section>

        <section className="brain-pro-tool-grid">
          {tools.map(({ href, icon: Icon, name, title, copy, features }, index) => (
            <article key={href}>
              <header>
                <span className="brain-pro-tool-number">0{index + 1}</span>
                <span className="brain-pro-tool-icon"><Icon size={22} /></span>
                {!isPro && <span className="brain-pro-lock"><LockKeyhole size={11} /> PRO</span>}
              </header>
              <span className="eyebrow">{name}</span>
              <h2>{title[locale]}</h2>
              <p>{copy[locale]}</p>
              <ul>{features[locale].map((feature) => <li key={feature}><Check size={13} /> {feature}</li>)}</ul>
              <Link href={href}>
                {isPro ? (es ? "Abrir herramienta" : "Open tool") : (es ? "Ver vista previa" : "Preview feature")}
                <ArrowRight size={15} />
              </Link>
            </article>
          ))}
        </section>

        {!isPro && (
          <section className="brain-pro-hub-upgrade">
            <div><Sparkles size={22} /><span><strong>{es ? "Desbloquea todo Brain Pro" : "Unlock the complete Brain Pro suite"}</strong><small>{es ? "14 días gratis · Después 5 €/mes · Cancela cuando quieras" : "14 days free · Then €5/month · Cancel anytime"}</small></span></div>
            <Link href="/pro">{es ? "Ver plan y empezar" : "View plan and start"} <ArrowRight size={16} /></Link>
          </section>
        )}
      </div>
    </main>
  );
}
