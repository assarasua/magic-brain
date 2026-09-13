"use client";

import {
  BarChart3,
  BrainCircuit,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  Sparkles,
  WalletCards,
  X,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useLanguage } from "@/components/language-provider";

const steps = [
  { icon: BarChart3, accent: "market", destination: "/market" },
  { icon: WalletCards, accent: "portfolio", destination: "/portfolio" },
  { icon: Eye, accent: "watchlist", destination: "/watchlist" },
  { icon: BrainCircuit, accent: "brain", destination: "/discover" },
] as const;

export function ProductTour() {
  const pathname = usePathname();
  const router = useRouter();
  const { locale } = useLanguage();
  const es = locale === "es";
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (pathname === "/login") return;
    const controller = new AbortController();
    fetch("/api/account", { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((account: { productTourCompleted?: boolean } | null) => {
        if (account && account.productTourCompleted === false) setOpen(true);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [pathname]);

  const complete = async (destination?: string) => {
    if (saving) return;
    setSaving(true);
    const response = await fetch("/api/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productTourCompleted: true }),
    });
    if (response.ok) {
      setOpen(false);
      if (destination) router.push(destination);
    }
    setSaving(false);
  };

  if (!open) return null;

  const copy = es
    ? [
        {
          eyebrow: "PASO 1 · MERCADO",
          title: "Detecta qué cartas se están moviendo.",
          body: "Compara subidas y bajadas, cambia el periodo y entra en el historial diario de cualquier carta antes de decidir.",
          points: ["Movimientos de 7 y 30 días", "Filtros avanzados", "Área exclusiva Reserved List"],
        },
        {
          eyebrow: "PASO 2 · CARTERA",
          title: "Convierte tu colección en una cartera.",
          body: "Añade precio y fecha de compra. Magic Brain calcula valor, rentabilidad, concentración y evolución histórica.",
          points: ["Beneficio no realizado", "Coste frente a valor actual", "Riesgo por concentración"],
        },
        {
          eyebrow: "PASO 3 · WATCHLIST",
          title: "Guarda oportunidades sin perderlas de vista.",
          body: "Sigue cartas antes de comprar y utiliza Discover para alimentar tu lista con recomendaciones relevantes.",
          points: ["Lista sincronizada", "Precio y tendencia visibles", "Decisiones separadas de tu cartera"],
        },
        {
          eyebrow: "PASO 4 · BRAIN PRO",
          title: "Haz que las recomendaciones se adapten a ti.",
          body: "Configura presupuesto, riesgo, estrategia y tipos de carta. Brain Pro usa ese perfil para construir y descubrir ideas gratis por ahora.",
          points: ["Preferencias personalizadas", "Portfolio generado por estrategia", "Discover con gestos rápidos"],
        },
      ]
    : [
        {
          eyebrow: "STEP 1 · MARKET",
          title: "See which cards are moving.",
          body: "Compare gainers and losers, change the period, and inspect any card's daily history before deciding.",
          points: ["7 and 30-day movement", "Advanced filters", "Dedicated Reserved List area"],
        },
        {
          eyebrow: "STEP 2 · PORTFOLIO",
          title: "Turn your collection into a portfolio.",
          body: "Add purchase price and date. Magic Brain calculates value, returns, concentration, and historical performance.",
          points: ["Unrealised return", "Cost versus current value", "Concentration risk"],
        },
        {
          eyebrow: "STEP 3 · WATCHLIST",
          title: "Save opportunities without losing track.",
          body: "Follow cards before buying and use Discover to fill your list with relevant recommendations.",
          points: ["Synced watchlist", "Visible price and trend", "Ideas kept separate from holdings"],
        },
        {
          eyebrow: "STEP 4 · BRAIN PRO",
          title: "Make every recommendation personal.",
          body: "Set your budget, risk, strategy, and card types. Brain Pro uses that profile to build and discover ideas, free for now.",
          points: ["Personal preferences", "Strategy-built portfolios", "Fast swipe discovery"],
        },
      ];
  const current = copy[step];
  const Icon = steps[step].icon;
  const isLast = step === steps.length - 1;

  return (
    <div className="tour-overlay" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      <section className="product-tour">
        <button className="tour-close" onClick={() => complete()} aria-label={es ? "Saltar introducción" : "Skip introduction"}><X size={17} /></button>
        <div className={`tour-visual ${steps[step].accent}`}>
          <div className="tour-visual-orbit"><Icon size={38} /></div>
          <div className="tour-mini-card primary"><span /><strong>{step === 0 ? "+12.8%" : step === 1 ? "€1,284" : step === 2 ? "24 cards" : "94% match"}</strong><small>Magic Brain</small></div>
          <div className="tour-mini-card secondary"><Sparkles size={15} /><span>{es ? "Información accionable" : "Actionable insight"}</span></div>
        </div>
        <div className="tour-copy">
          <span className="eyebrow">{current.eyebrow}</span>
          <h2 id="tour-title">{current.title}</h2>
          <p>{current.body}</p>
          <ul>{current.points.map((point) => <li key={point}><Check size={14} /> {point}</li>)}</ul>
          <div className="tour-progress" aria-label={`${step + 1} / ${steps.length}`}>
            {steps.map((item, index) => <span key={item.accent} className={index <= step ? "active" : ""} />)}
          </div>
          <footer>
            <button className="tour-back" onClick={() => setStep((value) => value - 1)} disabled={step === 0}><ChevronLeft size={15} /> {es ? "Atrás" : "Back"}</button>
            <button className="tour-next" onClick={() => isLast ? complete() : setStep((value) => value + 1)} disabled={saving}>
              {isLast ? (es ? "Empezar" : "Get started") : (es ? "Continuar" : "Continue")}
              {!isLast && <ChevronRight size={15} />}
            </button>
          </footer>
        </div>
      </section>
    </div>
  );
}
