"use client";

import { ArrowRight, Crown, LockKeyhole, Sparkles } from "lucide-react";
import Link from "next/link";
import { ReactNode, useEffect, useState } from "react";
import { useLanguage } from "@/components/language-provider";
import { ProFeaturePreview, type ProFeature } from "@/components/pro-feature-preview";

export function ProGate({
  feature,
  children,
}: {
  feature: ProFeature;
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
        label: es ? "Constructor de cartera" : "Portfolio Builder",
        title: es ? "Pasa de una tesis a una cartera lista para evaluar." : "Turn an investment thesis into a portfolio ready to evaluate.",
        description: es ? "Brain convierte tu presupuesto, riesgo y preferencias en una asignación diversificada y explica cada posición." : "Brain turns your budget, risk, and preferences into a diversified allocation and explains every position.",
        outcome: es ? "Resultado: una estrategia concreta con tamaños de posición y próximos pasos." : "Outcome: a concrete strategy with position sizes and next steps.",
        benefits: es ? ["Hasta 20 posiciones", "Tesis y puntuación explicables", "Consejos de compra por carta"] : ["Up to 20 positions", "Explainable thesis and scoring", "Per-card buyer guidance"],
      },
      analyst: {
        label: "Ask Brain",
        title: es ? "Convierte el historial de precios en una respuesta útil." : "Turn complete price history into a useful answer.",
        description: es ? "Pregunta en lenguaje natural cuándo ocurrió un movimiento, cuánto duró y qué cambió." : "Ask in natural language when a move happened, how long it lasted, and what changed.",
        outcome: es ? "Resultado: fechas y métricas que puedes comprobar antes de actuar." : "Outcome: dates and metrics you can verify before acting.",
        benefits: es ? ["Preguntas en lenguaje natural", "Fechas y movimientos clave", "Respuestas basadas en datos"] : ["Natural-language questions", "Key dates and price moves", "Data-grounded answers"],
      },
      signals: {
        label: "Brain Signals",
        title: es ? "Decide con el contexto del mercado, no solo con un porcentaje." : "Decide with market context, not just a percentage.",
        description: es ? "Lee régimen, amplitud, dispersión y oportunidades priorizadas antes de tomar una posición." : "Read regime, breadth, dispersion, and prioritised opportunities before taking a position.",
        outcome: es ? "Resultado: señales priorizadas con riesgo y zona de vigilancia." : "Outcome: prioritised signals with risk and a practical watch zone.",
        benefits: es ? ["Índice de mercado 7D / 30D / 90D", "Amplitud, riesgo y puntuación", "Zonas de vigilancia accionables"] : ["7D / 30D / 90D market index", "Breadth, risk, and signal scores", "Actionable watch zones"],
      },
      discover: {
        label: "Brain Discovery",
        title: es ? "Encuentra oportunidades que encajan con tu perfil." : "Find opportunities that fit your profile.",
        description: es ? "Revisa una selección personalizada con afinidad, precio, tendencia y motivo de recomendación." : "Review a personal feed with profile fit, price, trend, and the reason each card was selected.",
        outcome: es ? "Resultado: una shortlist relevante guardada directamente en tu watchlist." : "Outcome: a relevant shortlist saved directly to your watchlist.",
        benefits: es ? ["Puntuación de afinidad personal", "Precio, tendencia y razonamiento", "Guardar o pasar en un gesto"] : ["Personal match score", "Price, trend, and rationale", "Save or pass in one gesture"],
      },
    }[feature];
    return (
      <section className={`pro-gate pro-gate-${feature}`}>
        <div className="pro-gate-mark"><LockKeyhole size={25} /></div>
        <span className="pro-badge"><Crown size={13} /> {content.label} · Pro</span>
        <h1>{content.title}</h1>
        <p>{content.description}</p>
        <p className="pro-gate-outcome">{content.outcome}</p>
        <ProFeaturePreview feature={feature} locale={locale} />
        <div className="pro-gate-capabilities" aria-label={es ? "Incluido con Pro" : "Included with Pro"}>
          <span className="pro-gate-capabilities-label">{es ? "INCLUIDO CON PRO" : "INCLUDED WITH PRO"}</span>
          {content.benefits.map((benefit, index) => (
            <div key={benefit}>
              <span>0{index + 1}</span>
              <strong>{benefit}</strong>
            </div>
          ))}
        </div>
        <div className="pro-plan-clarity">
          <span><b>{es ? "Basic" : "Basic"}</b>{es ? "Seguimiento de cartera y exploración del mercado" : "Portfolio tracking and market browsing"}</span>
          <span><b>Brain Pro</b>{es ? "Las cuatro herramientas de inteligencia, desbloqueadas" : "All four intelligence tools, unlocked"}</span>
        </div>
        <div className="pro-gate-actions">
          <Link href="/pro">{es ? "Ver Brain Pro y probar gratis" : "See Brain Pro and try free"} <ArrowRight size={16} /></Link>
          <Link href="/">{es ? "Volver al panel" : "Back to dashboard"}</Link>
        </div>
        <small>{es ? "14 días gratis · Después 5 €/mes · Cancela cuando quieras" : "14 days free · Then €5/month · Cancel anytime"}</small>
      </section>
    );
  }

  return children;
}
