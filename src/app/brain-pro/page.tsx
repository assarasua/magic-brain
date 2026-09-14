"use client";

import {
  ArrowLeft,
  ArrowRight,
  BrainCircuit,
  Check,
  Heart,
  MessageCircleQuestion,
  Target,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { AuthControl } from "@/components/auth-control";
import { MagicBrainLogo, MagicBrainMark } from "@/components/brand-logo";
import { LanguageToggle, useLanguage } from "@/components/language-provider";
import { ProBadge, ProNotice } from "@/components/magic-brain-pro";
import { ProFeaturePreview, type ProFeature } from "@/components/pro-feature-preview";

const tools = [
  {
    href: "/predict",
    feature: "predict" as ProFeature,
    icon: Target,
    name: "Predict",
    title: {
      en: "Stress-test the growth case for any set.",
      es: "Pon a prueba el potencial de crecimiento de cualquier edición.",
    },
    copy: {
      en: "Compare transparent scenarios against inflation, the S&P 500, or an extreme risk-and-reward target.",
      es: "Compara escenarios transparentes con inflación, S&P 500 o un objetivo de riesgo y retorno extremos.",
    },
    features: {
      en: ["Growth grade", "Bear/base/bull range", "Confidence and risks"],
      es: ["Grado de growth", "Rango bajista/base/alcista", "Confianza y riesgos"],
    },
  },
  {
    href: "/brain",
    feature: "brain" as ProFeature,
    icon: BrainCircuit,
    name: "Collection Curator",
    title: {
      en: "Build a card selection around what you value.",
      es: "Crea una selección de cartas alrededor de lo que valoras.",
    },
    copy: {
      en: "Turn budget, horizon, colours, rarity, and market preferences into an explainable collection plan.",
      es: "Convierte presupuesto, horizonte, colores, rareza y preferencias de mercado en un plan de colección explicable.",
    },
    features: {
      en: ["Up to 20 positions", "Position sizing", "Buyer tips"],
      es: ["Hasta 20 posiciones", "Tamaño de posición", "Consejos de compra"],
    },
  },
  {
    href: "/signals",
    feature: "signals" as ProFeature,
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
    feature: "analyst" as ProFeature,
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
    feature: "discover" as ProFeature,
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

  return (
    <main className="account-page brain-pro-hub">
      <header className="account-topbar">
        <Link href="/" className="inventory-brand"><MagicBrainLogo /></Link>
        <nav><Link href="/signals">Brain Signals</Link><Link href="/portfolio">{t("Portfolio")}</Link><Link href="/donate">{es ? "Donar" : "Donate"}</Link></nav>
        <LanguageToggle />
        <AuthControl compact />
        <Link href="/" className="back-dashboard"><ArrowLeft size={15} /> {t("Dashboard")}</Link>
      </header>

      <div className="brain-pro-hub-content">
        <section className="brain-pro-hub-hero">
          <div className="brain-pro-hub-mark"><MagicBrainMark size={54} /></div>
          <ProBadge />
          <h1>{es ? "Más formas de conocer y disfrutar tu colección." : "More ways to know and enjoy your collection."}</h1>
          <p>{es ? "Explora ediciones, entiende movimientos de valor y descubre cartas desde un único espacio." : "Explore sets, understand value movement, and discover cards from one thoughtful workspace."}</p>
          <ProNotice />
        </section>

        <section className="brain-pro-tool-grid">
          {tools.map(({ href, feature, icon: Icon, name, title, copy, features }, index) => (
            <article key={href}>
              <header>
                <span className="brain-pro-tool-number">0{index + 1}</span>
                <span className="brain-pro-tool-icon"><Icon size={22} /></span>
              </header>
              <span className="eyebrow">{name}</span>
              <h2>{title[locale]}</h2>
              <p>{copy[locale]}</p>
              <ProFeaturePreview feature={feature} locale={locale} compact />
              <ul>{features[locale].map((feature) => <li key={feature}><Check size={13} /> {feature}</li>)}</ul>
              <div className="brain-pro-tool-actions">
                <Link href={href}>
                  {es ? "Abrir herramienta" : "Open tool"}
                  <ArrowRight size={15} />
                </Link>
              </div>
            </article>
          ))}
        </section>

      </div>
    </main>
  );
}
