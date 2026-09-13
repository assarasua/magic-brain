"use client";

import { ArrowRight, Crown, LockKeyhole, Sparkles } from "lucide-react";
import Link from "next/link";
import { ReactNode, useEffect, useState } from "react";
import { useLanguage } from "@/components/language-provider";

export function ProGate({
  feature,
  children,
}: {
  feature: "brain" | "analyst" | "signals" | "discover";
  children: ReactNode;
}) {
  const { locale } = useLanguage();
  const es = locale === "es";
  const [access, setAccess] = useState<"loading" | "basic" | "pro">("loading");

  useEffect(() => {
    fetch("/api/account")
      .then((response) => response.json())
      .then((account: { isPro: boolean }) =>
        setAccess(account.isPro ? "pro" : "basic"),
      )
      .catch(() => setAccess("basic"));
  }, []);

  if (access === "loading") {
    return (
      <div className="pro-gate-loading">
        <Sparkles size={24} />
        <span>{es ? "Comprobando acceso Brain Pro…" : "Checking Brain Pro access…"}</span>
      </div>
    );
  }

  if (access === "basic") {
    const content = {
      brain: {
        label: "Brain Portfolio",
        title: es ? "Construye una estrategia adaptada a ti." : "Build a strategy tailored to you.",
        description: es ? "Convierte presupuesto, riesgo y preferencias en una cartera diversificada de hasta 20 posiciones." : "Turn your budget, risk, and preferences into a diversified portfolio of up to 20 positions.",
        benefits: es ? ["Asignación por posición", "Tesis explicada", "Consejos de compra"] : ["Position sizing", "Explainable thesis", "Buyer guidance"],
      },
      analyst: {
        label: "Ask Brain",
        title: es ? "Pregunta a todo el histórico del mercado." : "Ask the complete market history.",
        description: es ? "Analiza fechas, grandes movimientos y cambios de precio usando tus datos reales." : "Analyse dates, major moves, and price changes using your real market data.",
        benefits: es ? ["Consultas en lenguaje natural", "Fechas y movimientos", "Respuestas con datos"] : ["Natural-language queries", "Dates and major moves", "Data-grounded answers"],
      },
      signals: {
        label: "Brain Signals",
        title: es ? "Tu terminal de decisiones para invertir." : "Your investment decision terminal.",
        description: es ? "Lee el régimen de mercado, amplitud, volatilidad y oportunidades antes de tomar una posición." : "Read market regime, breadth, volatility, and opportunities before taking a position.",
        benefits: es ? ["Índice 7D / 30D / 90D", "Riesgo y puntuación", "Zonas de vigilancia"] : ["7D / 30D / 90D index", "Risk and signal scores", "Watch zones"],
      },
      discover: {
        label: "Brain Discovery",
        title: es ? "Descubre cartas adaptadas a tu perfil." : "Discover cards matched to your profile.",
        description: es ? "Explora una selección personalizada y guarda las mejores oportunidades en tu watchlist." : "Explore a personalised feed and save the strongest opportunities to your watchlist.",
        benefits: es ? ["Afinidad personal", "Señales de precio", "Decisiones rápidas"] : ["Personal match", "Price signals", "Fast decisions"],
      },
    }[feature];
    return (
      <section className={`pro-gate pro-gate-${feature}`}>
        <div className="pro-gate-mark"><LockKeyhole size={25} /></div>
        <span className="pro-badge"><Crown size={13} /> {content.label} · Pro</span>
        <h1>{content.title}</h1>
        <p>{content.description}</p>
        <div className="pro-gate-preview">
          {content.benefits.map((benefit, index) => (
            <div key={benefit}>
              <span>0{index + 1}</span>
              <strong>{benefit}</strong>
            </div>
          ))}
        </div>
        <div className="pro-gate-actions">
          <Link href="/pro">{es ? "Desbloquear con Brain Pro" : "Unlock with Brain Pro"} <ArrowRight size={16} /></Link>
          <Link href="/">{es ? "Volver al panel" : "Back to dashboard"}</Link>
        </div>
        <small>{es ? "14 días gratis · Después 5 €/mes · Cancela cuando quieras" : "14 days free · Then €5/month · Cancel anytime"}</small>
      </section>
    );
  }

  return children;
}
