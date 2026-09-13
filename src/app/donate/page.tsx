"use client";

import {
  ArrowLeft,
  ArrowRight,
  HeartHandshake,
  LoaderCircle,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AuthControl } from "@/components/auth-control";
import { MagicBrainLogo } from "@/components/brand-logo";
import { LanguageToggle, useLanguage } from "@/components/language-provider";
import { formatCurrency } from "@/lib/data";

const amounts = [5, 10, 25, 50];

export default function DonatePage() {
  const { locale, t } = useLanguage();
  const es = locale === "es";
  const [amount, setAmount] = useState(10);
  const [customAmount, setCustomAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [status] = useState<"success" | "cancelled" | null>(() => {
    if (typeof window === "undefined") return null;
    const value = new URLSearchParams(window.location.search).get("donation");
    return value === "success" || value === "cancelled" ? value : null;
  });
  const selectedAmount = customAmount ? Number(customAmount) : amount;

  const donate = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/stripe/donation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: selectedAmount }),
      });
      const result = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !result.url) {
        throw new Error(result.error ?? "Unable to open Stripe Checkout");
      }
      window.location.assign(result.url);
    } catch (checkoutError) {
      setError(
        checkoutError instanceof Error
          ? checkoutError.message
          : "Unable to open Stripe Checkout",
      );
      setLoading(false);
    }
  };

  return (
    <main className="account-page donate-page">
      <header className="account-topbar">
        <Link href="/" className="inventory-brand"><MagicBrainLogo /></Link>
        <nav><Link href="/pro">Brain Pro</Link><Link href="/signals">Brain Signals</Link><Link href="/portfolio">{t("Portfolio")}</Link></nav>
        <LanguageToggle />
        <AuthControl compact />
        <Link href="/" className="back-dashboard"><ArrowLeft size={15} /> {t("Dashboard")}</Link>
      </header>

      <div className="donate-shell">
        {status === "success" && (
          <div className="donation-status success">
            <HeartHandshake size={20} />
            <div><strong>{es ? "Gracias por apoyar Magic Brain." : "Thank you for supporting Magic Brain."}</strong><span>{es ? "Stripe está confirmando tu contribución." : "Stripe is confirming your contribution."}</span></div>
          </div>
        )}
        {status === "cancelled" && (
          <div className="donation-status">
            <span>{es ? "No se realizó ningún cargo." : "No charge was made."}</span>
          </div>
        )}

        <section className="donate-hero">
          <div>
            <span className="pro-badge"><HeartHandshake size={14} /> {es ? "APOYA EL PROYECTO" : "SUPPORT THE PROJECT"}</span>
            <h1>{es ? "Ayuda a construir mejores herramientas para inversores de Magic." : "Help build better tools for Magic investors."}</h1>
            <p>{es ? "Tu aportación financia infraestructura de datos, nuevas analíticas y el desarrollo independiente de Magic Brain." : "Your contribution supports data infrastructure, new analytics, and independent development of Magic Brain."}</p>
            <ul>
              <li><Sparkles size={15} /> {es ? "Más señales y métricas de mercado" : "More market signals and metrics"}</li>
              <li><Sparkles size={15} /> {es ? "Mejor cobertura histórica" : "Better historical coverage"}</li>
              <li><Sparkles size={15} /> {es ? "Desarrollo continuo del producto" : "Continuous product development"}</li>
            </ul>
          </div>

          <div className="donation-card">
            <span className="eyebrow">{es ? "APORTACIÓN ÚNICA" : "ONE-TIME CONTRIBUTION"}</span>
            <h2>{es ? "Elige una cantidad" : "Choose an amount"}</h2>
            <div className="donation-amounts">
              {amounts.map((value) => (
                <button
                  key={value}
                  className={!customAmount && amount === value ? "active" : ""}
                  onClick={() => {
                    setAmount(value);
                    setCustomAmount("");
                  }}
                >
                  {formatCurrency(value)}
                </button>
              ))}
            </div>
            <label>
              {es ? "Otra cantidad" : "Custom amount"}
              <div><span>€</span><input type="number" min="2" max="500" step="1" value={customAmount} onChange={(event) => setCustomAmount(event.target.value)} placeholder="20" /></div>
            </label>
            <button className="donation-submit" onClick={donate} disabled={loading || !Number.isFinite(selectedAmount) || selectedAmount < 2 || selectedAmount > 500}>
              {loading ? <LoaderCircle className="spin" size={18} /> : <HeartHandshake size={18} />}
              {loading ? (es ? "Abriendo Stripe…" : "Opening Stripe…") : es ? `Aportar ${formatCurrency(selectedAmount)}` : `Contribute ${formatCurrency(selectedAmount)}`}
              {!loading && <ArrowRight size={16} />}
            </button>
            {error && <div className="pro-error">{error}</div>}
            <div className="donation-security"><ShieldCheck size={15} /> {es ? "Pago único y seguro procesado por Stripe." : "Secure one-time payment processed by Stripe."}</div>
            <small>{es ? "Esta aportación no es una donación benéfica y no es deducible fiscalmente." : "This contribution is not a charitable donation and is not tax-deductible."}</small>
          </div>
        </section>
      </div>
    </main>
  );
}
