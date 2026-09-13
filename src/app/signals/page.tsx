"use client";

/* eslint-disable @next/next/no-img-element */

import {
  ArrowLeft,
  BrainCircuit,
  Lightbulb,
  LoaderCircle,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AuthControl } from "@/components/auth-control";
import { MagicBrainLogo } from "@/components/brand-logo";
import { useCardDetail } from "@/components/card-detail-provider";
import { LanguageToggle, useLanguage } from "@/components/language-provider";
import { ProGate } from "@/components/pro-gate";
import type { CatalogCard } from "@/lib/catalog";
import { formatCurrency } from "@/lib/data";

type Signal = CatalogCard & { direction: "up" | "down" };

function SignalsContent() {
  const { locale } = useLanguage();
  const { cardSurfaceProps } = useCardDetail();
  const es = locale === "es";
  const [signals, setSignals] = useState<Signal[]>([]);
  const [filter, setFilter] = useState<"all" | "up" | "down">("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/brain/signals", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Signals unavailable");
        return response.json() as Promise<{ signals: Signal[] }>;
      })
      .then((result) => setSignals(result.signals))
      .catch((error: Error) => {
        if (error.name !== "AbortError") setSignals([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const visible = signals.filter(
    (signal) => filter === "all" || signal.direction === filter,
  );

  return (
    <div className="account-content signals-content">
      <div className="signals-hero">
        <span className="pro-pill"><Sparkles size={13} /> Brain Pro</span>
        <h1>{es ? "Brain Signals" : "Brain Signals"}</h1>
        <p>
          {es
            ? "Señales diarias que convierten movimientos de precio en contexto y próximos pasos."
            : "Daily signals that turn price movement into context and practical next steps."}
        </p>
        <div className="signals-controls" aria-label={es ? "Filtrar señales" : "Filter signals"}>
          {([
            ["all", es ? "Todas" : "All"],
            ["up", es ? "Impulso" : "Momentum"],
            ["down", es ? "Correcciones" : "Pullbacks"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              className={filter === value ? "active" : ""}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="signals-state"><LoaderCircle className="spin" size={24} /> {es ? "Analizando el mercado…" : "Analysing the market…"}</div>
      ) : visible.length ? (
        <div className="signals-grid">
          {visible.map((signal) => {
            const change = signal.change7d ?? 0;
            const strong = Math.abs(change) >= 15;
            const buyerTip = signal.direction === "up"
              ? strong
                ? es ? "No persigas la subida. Espera consolidación o divide la entrada." : "Do not chase the move. Wait for consolidation or scale into the position."
                : es ? "Confirma liquidez y compara el coste total antes de entrar." : "Confirm liquidity and compare total cost before entering."
              : es ? "Espera estabilización y configura una alerta antes de comprar la caída." : "Wait for stabilisation and set an alert before buying the dip.";
            return (
              <article className="signal-card card-surface" key={`${signal.direction}-${signal.id}`} {...cardSurfaceProps(signal)}>
                {signal.imageUrl && <img src={signal.imageUrl} alt="" />}
                <div className="signal-card-copy">
                  <div>
                    <span className={`signal-direction ${signal.direction}`}>
                      {signal.direction === "up" ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                      {signal.direction === "up" ? (es ? "Impulso" : "Momentum") : (es ? "Corrección" : "Pullback")}
                    </span>
                    <span className="signal-strength">{strong ? (es ? "Fuerte" : "Strong") : (es ? "Moderada" : "Moderate")}</span>
                  </div>
                  <h2>{signal.name}</h2>
                  <p>{signal.setName} · {signal.setCode.toUpperCase()}</p>
                  <div className="signal-numbers">
                    <strong>{signal.price == null ? "—" : formatCurrency(signal.price)}</strong>
                    <span className={signal.direction === "up" ? "up" : "down"}>
                      {change >= 0 ? "+" : ""}{change.toFixed(1)}% <small>7D</small>
                    </span>
                  </div>
                  <div className="signal-tip"><Lightbulb size={15} /><span><b>{es ? "Consejo para compradores" : "Buyer tip"}</b>{buyerTip}</span></div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="signals-state"><BrainCircuit size={25} /> {es ? "No hay señales disponibles ahora." : "No signals are available right now."}</div>
      )}

      <div className="signals-disclaimer">
        <ShieldCheck size={15} />
        {es ? "Las señales son análisis de mercado, no asesoramiento financiero." : "Signals are market analysis, not financial advice."}
      </div>
    </div>
  );
}

export default function SignalsPage() {
  const { locale, t } = useLanguage();
  return (
    <main className="account-page signals-page">
      <header className="account-topbar">
        <Link href="/" className="inventory-brand"><MagicBrainLogo /></Link>
        <nav><Link href="/market">{t("Market")}</Link><Link href="/brain">Brain Pro</Link><Link href="/analyst">Ask Brain</Link></nav>
        <LanguageToggle />
        <AuthControl compact />
        <Link href="/" className="back-dashboard"><ArrowLeft size={15} /> {locale === "es" ? "Panel" : "Dashboard"}</Link>
      </header>
      <ProGate feature="brain"><SignalsContent /></ProGate>
    </main>
  );
}
