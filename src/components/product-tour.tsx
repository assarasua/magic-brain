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

export function ProductTour({
  initialCompleted,
}: {
  initialCompleted?: boolean;
} = {}) {
  const pathname = usePathname();
  const router = useRouter();
  const { locale } = useLanguage();
  const es = locale === "es";
  const [open, setOpen] = useState(initialCompleted === false);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initialCompleted !== undefined) return;
    if (pathname === "/login") return;
    const controller = new AbortController();
    fetch("/api/account", { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((account: { productTourCompleted?: boolean } | null) => {
        if (account && account.productTourCompleted === false) setOpen(true);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [initialCompleted, pathname]);

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
          eyebrow: "PASO 2 · COLECCIÓN",
          title: "Reúne tus cartas y ediciones.",
          body: "Registra copias, edición, precio y fecha de compra. Magic Brain te ayuda a conocer el valor y la evolución de tu colección.",
          points: ["Copias y ediciones", "Coste frente a valor actual", "Evolución de la colección"],
        },
        {
          eyebrow: "PASO 3 · WATCHLIST",
          title: "Guarda cartas que te gustaría encontrar.",
          body: "Sigue cartas antes de añadirlas y utiliza Descubrir para encontrar nuevas favoritas.",
          points: ["Lista sincronizada", "Precio y tendencia visibles", "Ideas separadas de tu colección"],
        },
        {
          eyebrow: "PASO 4 · BRAIN PRO",
          title: "Haz que las recomendaciones se adapten a ti.",
          body: "Configura presupuesto, criterios y tipos de carta. Magic Brain Pro usa ese perfil para ayudarte a explorar y crear selecciones. Actualmente es gratis para usuarios pioneros.",
          points: ["Preferencias personalizadas", "Selecciones explicables", "Descubrimiento con gestos rápidos"],
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
          eyebrow: "STEP 2 · COLLECTION",
          title: "Bring your cards and printings together.",
          body: "Record copies, printing, purchase price, and date. Magic Brain helps you understand your collection's value and evolution.",
          points: ["Copies and printings", "Cost versus current value", "Collection value over time"],
        },
        {
          eyebrow: "STEP 3 · WATCHLIST",
          title: "Save cards you would love to find.",
          body: "Follow cards before adding them and use Discover to meet new favourites.",
          points: ["Synced watchlist", "Visible price and trend", "Ideas kept separate from your collection"],
        },
        {
          eyebrow: "STEP 4 · BRAIN PRO",
          title: "Make every recommendation personal.",
          body: "Set your budget, criteria, and card types. Magic Brain Pro uses that profile to help you explore and build selections. It is currently free for early adopters.",
          points: ["Personal preferences", "Explainable selections", "Fast swipe discovery"],
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
