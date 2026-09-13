"use client";

import {
  BarChart3,
  Check,
  LoaderCircle,
  ShieldCheck,
  Sparkles,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { MagicBrainLogo, MagicBrainMark } from "@/components/brand-logo";
import { LanguageToggle, useLanguage } from "@/components/language-provider";

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
          <h1>{es ? "Tu ventaja en el mercado de Magic empieza aquí." : "Your edge in the Magic market starts here."}</h1>
          <p>{es ? "Crea tu cuenta para seguir precios, analizar tu colección y descubrir oportunidades adaptadas a tu perfil." : "Create your account to track prices, analyse your collection, and discover opportunities tailored to you."}</p>
          <div className="auth-benefits">
            <div><span><BarChart3 size={18} /></span><div><strong>{es ? "Mercado bajo control" : "Market clarity"}</strong><small>{es ? "Historiales diarios y señales de movimiento." : "Daily histories and movement signals."}</small></div></div>
            <div><span><WalletCards size={18} /></span><div><strong>{es ? "Tu cartera real" : "Your real portfolio"}</strong><small>{es ? "Rentabilidad, exposición y coste de compra." : "Returns, exposure, and purchase cost."}</small></div></div>
            <div><span><Sparkles size={18} /></span><div><strong>Brain Pro</strong><small>{es ? "Estrategias y descubrimiento personalizados, gratis por ahora." : "Personalised strategies and discovery, free for now."}</small></div></div>
          </div>
        </div>

        <div className="login-card signup-card">
          <div className="login-mark"><MagicBrainMark size={42} /></div>
          <span className="eyebrow">{es ? "CREA TU CUENTA GRATIS" : "CREATE YOUR FREE ACCOUNT"}</span>
          <h2>{es ? "Empieza a invertir con más contexto." : "Start investing with more context."}</h2>
          <p>{es ? "Un único acceso para tu cartera, watchlist y preferencias." : "One secure account for your portfolio, watchlist, and preferences."}</p>
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
      <footer className="creator-credit">
        {es ? "Creado por " : "Created by "}
        <a href="https://bizkardolab.com" target="_blank" rel="noreferrer">
          Asier Sarasua · BizkardoLab
        </a>
      </footer>
    </main>
  );
}
