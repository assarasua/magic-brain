"use client";

import { ArrowRight, Crown, LockKeyhole, Sparkles } from "lucide-react";
import Link from "next/link";
import { ReactNode, useEffect, useState } from "react";
import { useLanguage } from "@/components/language-provider";

export function ProGate({
  feature,
  children,
}: {
  feature: "brain" | "analyst";
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
    const analyst = feature === "analyst";
    return (
      <section className="pro-gate">
        <div className="pro-gate-mark"><LockKeyhole size={25} /></div>
        <span className="pro-badge"><Crown size={13} /> Brain Pro</span>
        <h1>
          {analyst
            ? es ? "Pregunta a Brain con acceso Pro." : "Ask Brain with Pro access."
            : es ? "Construye tu estrategia con Brain Pro." : "Build your strategy with Brain Pro."}
        </h1>
        <p>
          {analyst
            ? es
              ? "Analiza historiales completos, identifica grandes movimientos y obtén respuestas basadas en datos reales."
              : "Analyse complete price histories, identify major movements, and get answers grounded in real data."
            : es
              ? "Convierte presupuesto, riesgo y preferencias en una cartera diversificada de hasta 20 posiciones."
              : "Turn your budget, risk, and preferences into a diversified portfolio of up to 20 positions."}
        </p>
        <div>
          <Link href="/pro">{es ? "Descubrir Brain Pro" : "Explore Brain Pro"} <ArrowRight size={16} /></Link>
          <Link href="/">{es ? "Volver al panel" : "Back to dashboard"}</Link>
        </div>
        <small>{es ? "14 días gratis · Después €5/mes" : "14 days free · Then €5/month"}</small>
      </section>
    );
  }

  return children;
}
