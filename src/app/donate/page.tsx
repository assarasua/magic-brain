"use client";

import {
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  HeartHandshake,
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
  const [copied, setCopied] = useState(false);
  const selectedAmount = customAmount ? Number(customAmount) : amount;
  const recipient = "paypal.me/assarasua";
  const paypalUrl = `https://${recipient}/${selectedAmount.toFixed(2)}EUR`;

  const copyRecipient = async () => {
    await navigator.clipboard.writeText(`https://${recipient}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const openPayPal = () => {
    window.open(
      paypalUrl,
      "_blank",
      "noopener,noreferrer",
    );
  };

  return (
    <main className="account-page donate-page">
      <header className="account-topbar">
        <Link href="/" className="inventory-brand"><MagicBrainLogo /></Link>
        <nav><Link href="/brain-pro">Brain Pro</Link><Link href="/signals">Brain Signals</Link><Link href="/portfolio">{t("Portfolio")}</Link></nav>
        <LanguageToggle />
        <AuthControl compact />
        <Link href="/" className="back-dashboard"><ArrowLeft size={15} /> {t("Dashboard")}</Link>
      </header>

      <div className="donate-shell">
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
            <div className="donation-paypal-recipient">
              <span>{es ? "Destinatario PayPal" : "PayPal recipient"}</span>
              <strong>{recipient}</strong>
              <button onClick={copyRecipient}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? (es ? "Copiado" : "Copied") : (es ? "Copiar" : "Copy")}
              </button>
            </div>
            <button className="donation-submit" onClick={openPayPal} disabled={!Number.isFinite(selectedAmount) || selectedAmount < 2 || selectedAmount > 500}>
              <HeartHandshake size={18} />
              {es ? `Enviar ${formatCurrency(selectedAmount)} por PayPal` : `Send ${formatCurrency(selectedAmount)} with PayPal`}
              <ExternalLink size={16} />
            </button>
            <div className="donation-security"><ShieldCheck size={15} /> {es ? "PayPal abrirá el perfil de assarasua con el importe en EUR. Confirma los datos antes de enviar." : "PayPal will open assarasua's profile with the EUR amount. Confirm the details before sending."}</div>
            <small>{es ? "Esta aportación no es una donación benéfica y no es deducible fiscalmente." : "This contribution is not a charitable donation and is not tax-deductible."}</small>
          </div>
        </section>
      </div>
    </main>
  );
}
