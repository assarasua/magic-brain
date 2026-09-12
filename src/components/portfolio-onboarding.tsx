"use client";

import { Check, LibraryBig, Plus, Sparkles } from "lucide-react";
import Link from "next/link";
import { useLanguage } from "@/components/language-provider";

export function PortfolioOnboarding({
  compact = false,
  onAdd,
}: {
  compact?: boolean;
  onAdd?: () => void;
}) {
  const { locale } = useLanguage();
  const es = locale === "es";

  return (
    <section className={`portfolio-onboarding ${compact ? "compact" : ""}`}>
      <div className="onboarding-copy">
        <span className="eyebrow">{es ? "TU ESPACIO DE INVERSIÓN" : "YOUR INVESTING WORKSPACE"}</span>
        <h2>{es ? "Empieza con tu primera carta." : "Start with your first card."}</h2>
        <p>
          {es
            ? "Añade lo que ya tienes o deja que Brain proponga una estrategia. Las estadísticas aparecerán automáticamente."
            : "Add a card you own or let Brain propose a strategy. Your analytics will appear automatically."}
        </p>
        <div className="onboarding-actions">
          {onAdd ? (
            <button onClick={onAdd}><Plus size={16} /> {es ? "Añadir primera carta" : "Add first card"}</button>
          ) : (
            <Link className="primary" href="/portfolio"><Plus size={16} /> {es ? "Añadir primera carta" : "Add first card"}</Link>
          )}
          <Link href="/inventory"><LibraryBig size={15} /> {es ? "Explorar cartas" : "Explore cards"}</Link>
          <Link href="/brain"><Sparkles size={15} /> {es ? "Crear con Brain" : "Build with Brain"}</Link>
        </div>
      </div>
      {!compact && (
        <ol className="onboarding-steps">
          <li className="active"><span>1</span><div><strong>{es ? "Elige una carta" : "Choose a card"}</strong><small>{es ? "Busca cualquier edición" : "Search any printing"}</small></div></li>
          <li><span>2</span><div><strong>{es ? "Registra tu compra" : "Record your purchase"}</strong><small>{es ? "Precio, cantidad y fecha" : "Price, quantity, and date"}</small></div></li>
          <li><span><Check size={14} /></span><div><strong>{es ? "Obtén tus estadísticas" : "Unlock your analytics"}</strong><small>{es ? "Rendimiento y exposición" : "Performance and exposure"}</small></div></li>
        </ol>
      )}
    </section>
  );
}
