"use client";

/* eslint-disable @next/next/no-img-element */

import {
  BarChart3,
  Check,
  LoaderCircle,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useEffect, useState } from "react";
import { MagicBrainLogo, MagicBrainMark } from "@/components/brand-logo";
import { LanguageToggle, useLanguage } from "@/components/language-provider";
import { LandingContact } from "@/components/landing-contact";
import { movers } from "@/lib/data";

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.6 12.2c0-.7-.1-1.5-.2-2.2H12v4.3h6a5.2 5.2 0 0 1-2.2 3.3v2.8h3.6c2.1-2 3.2-4.8 3.2-8.2Z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.4-2.7l-3.6-2.8c-1 .7-2.3 1.1-3.8 1.1-2.9 0-5.3-2-6.2-4.6H2.1v2.9A11.2 11.2 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.8 14a6.7 6.7 0 0 1 0-4.1V7H2.1a11.2 11.2 0 0 0 0 9.9L5.8 14Z" />
      <path fill="#EA4335" d="M12 5.3c1.7 0 3.1.6 4.3 1.7l3.2-3.2A10.8 10.8 0 0 0 2.1 7l3.7 2.9c.9-2.7 3.3-4.6 6.2-4.6Z" />
    </svg>
  );
}

export default function LoginPage() {
  const { locale } = useLanguage();
  const [loading, setLoading] = useState(false);
  const es = locale === "es";

  useEffect(() => {
    const referral = new URLSearchParams(window.location.search).get("ref");
    if (/^[a-f0-9]{12}$/.test(referral ?? "")) {
      document.cookie = `magic_brain_referral=${referral}; Max-Age=2592000; Path=/; SameSite=Lax; Secure`;
    }
  }, []);

  const continueWithGoogle = () => {
    setLoading(true);
    const requestedPath = new URLSearchParams(window.location.search).get("callbackUrl");
    const redirectTo =
      requestedPath?.startsWith("/") && !requestedPath.startsWith("//")
        ? requestedPath
        : "/";
    void signIn("google", { redirectTo });
  };

  return (
    <main className="login-page">
      <header>
        <Link href="/" className="inventory-brand">
          <MagicBrainLogo />
        </Link>
        <LanguageToggle />
      </header>
      <section className="auth-onboarding">
        <div className="auth-onboarding-copy">
          <span className="pro-badge"><Sparkles size={13} /> Magic Brain</span>
          <h1>{es ? "Tu colección de Magic, más tuya que nunca." : "Know every card in your Magic collection."}</h1>
          <p>{es ? "Organiza tus cartas y ediciones, descubre nuevas favoritas y entiende su valor con el contexto que necesitas." : "Organize your cards and printings, discover new favourites, and understand their value with useful market context."}</p>
          <div className="auth-card-showcase" aria-label={es ? "Ejemplos de cartas analizadas" : "Examples of analysed cards"}>
            <div className="auth-card-stack">
              {movers.slice(0, 3).map((card, index) => (
                <img key={card.id} src={card.image} alt={`${card.name} — ${card.set}`} style={{ "--card-index": index } as React.CSSProperties} />
              ))}
            </div>
            <div className="auth-market-proof">
              <span><TrendingUp size={14} /> {es ? "Contexto actualizado" : "Fresh market context"}</span>
              <strong>90,000+</strong>
              <small>{es ? "impresiones y precios para explorar" : "printings and prices to explore"}</small>
            </div>
          </div>
          <div className="auth-benefits">
            <div><span><WalletCards size={18} /></span><div><strong>{es ? "Tu colección, bien organizada" : "Your collection, organized"}</strong><small>{es ? "Copias, ediciones, coste y valor actual en un solo lugar." : "Copies, printings, cost, and current value in one place."}</small></div></div>
            <div><span><Sparkles size={18} /></span><div><strong>{es ? "Descubrimientos personales" : "Personal discoveries"}</strong><small>{es ? "Encuentra cartas que encajan con lo que disfrutas coleccionando." : "Find cards that fit what you love to collect."}</small></div></div>
            <div><span><BarChart3 size={18} /></span><div><strong>{es ? "Contexto de mercado claro" : "Clear market context"}</strong><small>{es ? "Historial de precios y movimientos para cuidar mejor tu colección." : "Price history and movement to help you steward your collection."}</small></div></div>
          </div>
        </div>

        <div className="login-card signup-card">
          <div className="login-mark"><MagicBrainMark size={42} /></div>
          <span className="eyebrow">{es ? "CREA TU CUENTA GRATIS" : "CREATE YOUR FREE ACCOUNT"}</span>
          <h2>{es ? "Empieza a conocer mejor tu colección." : "Start knowing your collection better."}</h2>
          <p>{es ? "Un único acceso para tu colección, seguimiento y preferencias." : "One secure account for your collection, watchlist, and preferences."}</p>
          <button className="google-auth-cta" onClick={continueWithGoogle} disabled={loading}>
            {loading ? <LoaderCircle className="spin" size={19} /> : <GoogleMark />}
            {loading ? (es ? "Conectando…" : "Connecting…") : es ? "Continuar con Google" : "Continue with Google"}
          </button>
          <ul>
            <li><Check size={13} /> {es ? "Registro e inicio de sesión en un paso" : "Sign up or sign in in one step"}</li>
            <li><Check size={13} /> {es ? "Tus datos sincronizados de forma segura" : "Your data securely synchronised"}</li>
            <li><Check size={13} /> {es ? "Sin contraseña adicional" : "No additional password"}</li>
          </ul>
          <div className="login-security"><ShieldCheck size={15} /> {es ? "Magic Brain nunca recibe tu contraseña de Google." : "Magic Brain never receives your Google password."}</div>
          <small className="auth-terms">{es ? "Al continuar aceptas crear una cuenta de Magic Brain." : "By continuing, you agree to create a Magic Brain account."}</small>
        </div>
      </section>
      <section className="landing-product-story" aria-labelledby="product-story-heading">
        <div className="landing-product-heading">
          <span className="eyebrow">{es ? "TODO TU MAGIC, CON CONTEXTO" : "ALL YOUR MAGIC, IN CONTEXT"}</span>
          <h2 id="product-story-heading">{es ? "De una carpeta de cartas a una colección que conoces de verdad." : "From a binder of cards to a collection you truly understand."}</h2>
          <p>{es ? "Magic Brain une catálogo, organización e inteligencia de mercado para ayudarte a disfrutar cada carta y tomar decisiones informadas." : "Magic Brain brings catalogue data, organization, and market intelligence together so you can enjoy every card and make informed decisions."}</p>
        </div>
        <div className="landing-product-grid">
          <article><WalletCards size={21} /><span>01</span><h3>{es ? "Organiza cada impresión" : "Organize every printing"}</h3><p>{es ? "Registra copias, estado, idioma, coste y listas sin perder el detalle de la edición." : "Track copies, condition, language, cost, and lists without losing printing-level detail."}</p></article>
          <article><BarChart3 size={21} /><span>02</span><h3>{es ? "Entiende el movimiento" : "Understand every move"}</h3><p>{es ? "Consulta precios históricos, tendencias y señales respaldadas por datos observados." : "Explore price history, trends, and signals grounded in observed market data."}</p></article>
          <article><Sparkles size={21} /><span>03</span><h3>{es ? "Descubre qué mirar" : "Discover what to watch"}</h3><p>{es ? "Recibe oportunidades personalizadas, briefs diarios y contexto para nuevas cartas." : "Get personalized opportunities, daily briefs, and context for cards worth discovering."}</p></article>
        </div>
      </section>
      <LandingContact />
      <footer className="creator-credit">
        {es ? "Creado por " : "Created by "}
        <a href="https://bizkardolab.eu" target="_blank" rel="noreferrer">
          Asier Sarasua · BizkardoLab
        </a>
      </footer>
    </main>
  );
}
