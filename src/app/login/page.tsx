"use client";

/* eslint-disable @next/next/no-img-element */

import {
  ArrowRight,
  BarChart3,
  Braces,
  BookOpen,
  Bot,
  Check,
  Code2,
  Eye,
  Layers3,
  LoaderCircle,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  UserRound,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useEffect, useState } from "react";
import { MagicBrainLogo, MagicBrainMark } from "@/components/brand-logo";
import { LanguageToggle, useLanguage } from "@/components/language-provider";
import { LandingContact, NewsletterSignup } from "@/components/landing-contact";
import { movers, portfolioCards } from "@/lib/data";
import { instinctInviteUrl } from "@/lib/public-integration-links";
import styles from "./narrative.module.css";

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
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const es = locale === "es";
  const storyCards = [...movers, portfolioCards[2]];

  useEffect(() => {
    const referral = new URLSearchParams(window.location.search).get("ref");
    if (/^[a-f0-9]{12}$/.test(referral ?? "")) {
      window.sessionStorage.setItem("magic-brain-pending-referral", referral!);
      if (window.localStorage.getItem("magic-brain-cookie-consent-v1") === "all") {
        document.cookie = `magic_brain_referral=${referral}; Max-Age=2592000; Path=/; SameSite=Lax; Secure`;
      }
    }
  }, []);

  const continueWithGoogle = () => {
    if (!acceptedTerms) return;
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
      <header className="landing-header">
        <Link href="/" className="inventory-brand">
          <MagicBrainLogo />
        </Link>
        <nav className="landing-guide-nav" aria-label={es ? "Guías de integración" : "Integration guides"}>
          <Link href="/mcp">{es ? "Guía MCP" : "MCP guide"}</Link>
          <Link href="/webmcp">{es ? "Guía WebMCP" : "WebMCP guide"}</Link>
        </nav>
        <div className="landing-header-actions">
          <Link href="/market-movers" className="landing-movers-link"><TrendingDown size={15} />{es ? "Top cartas hoy" : "Today’s top cards"}</Link>
          <LanguageToggle />
        </div>
      </header>
      <section className={styles.hero}>
          <span className="pro-badge"><Sparkles size={13} /> Magic Brain</span>
          <h1>{es ? "Tu Magic. Tú eliges." : "Your Magic. Your call."}</h1>
          <p className={styles.promise}>{es ? "Precios, cartas y rulings. Sin abrir quince pestañas." : "Prices, cards and rulings. Without fifteen tabs."}</p>
          <p>{es ? "Usa Magic Brain a tu manera: explora la web tú mismo o deja que tu agente consulte cartas, precios y reglas por ti. El cerebro extra de tu grupo, estés al mando tú o tu asistente." : "Use Magic Brain your way: explore the website yourself, or let your agent look up cards, prices and rules for you. An extra brain for your Magic group, with you or your assistant at the controls."}</p>
      </section>
      <section className={styles.channels} id="choose-your-channel" aria-labelledby="channels-heading">
        <h2 id="channels-heading">{es ? "Elige tu lado." : "Choose your side."}</h2>
        <nav className={styles.sideChooser} aria-label={es ? "Cómo quieres usar Magic Brain" : "How you want to use Magic Brain"}><a href="#human-side"><UserRound size={16} />{es ? "Humano" : "Human"}</a><a href="#agent-side"><Bot size={16} />{es ? "Agéntico" : "Agentic"}</a></nav>
        <div className={styles.sideGrid}>
          <article className={styles.humanSide} id="human-side" tabIndex={-1}>
            <span className={styles.channelLabel}><UserRound size={18} /> {es ? "LADO HUMANO" : "HUMAN SIDE"}</span>
            <h3>{es ? "Yo llevo el mando." : "I’ll take the controls."}</h3>
            <p>{es ? "Explora cartas, compara precios y organiza tu colección desde la web. A tu ritmo, carta a carta." : "Explore cards, compare prices and organize your collection on the website. At your pace, card by card."}</p>
            <ol><li>{es ? "Abre los movimientos del mercado, sin registrarte." : "Open market movers, with no sign-up."}</li><li>{es ? "Consulta las cartas que te interesan." : "Explore the cards that catch your eye."}</li><li>{es ? "Crea una cuenta para guardar colección y seguimiento." : "Create an account to save your collection and watchlist."}</li></ol>
            <Link className={styles.primaryAction} href="/market-movers">{es ? "Explorar yo mismo" : "Explore it myself"}<ArrowRight size={16} /></Link><a className={styles.sideSecondary} href="#start-collection">{es ? "Empezar mi colección" : "Start my collection"}</a>
          </article>
          <article className={styles.agentSide} id="agent-side" tabIndex={-1}>
            <span className={styles.channelLabel}><Bot size={18} /> {es ? "LADO AGÉNTICO" : "AGENTIC SIDE"}</span>
            <h3>{es ? "Que mi agente se encargue." : "Let my agent handle it."}</h3>
            <p>{es ? "Pregunta en lenguaje normal. Tu agente elige las herramientas de Magic Brain, consulta los datos y te explica la respuesta." : "Ask in plain language. Your agent picks Magic Brain’s tools, checks the data and explains the answer."}</p>
            <ol><li>{es ? "Conecta tu asistente por MCP o abre un navegador con WebMCP." : "Connect your assistant through MCP or open a browser with WebMCP."}</li><li>{es ? "Pregunta por cartas, precios, efectos o rulings." : "Ask about cards, prices, effects or rulings."}</li><li>{es ? "Autoriza tu colección cuando la necesites; confirma los cambios." : "Authorize your collection when needed; confirm changes."}</li></ol>
            <a className={styles.primaryAction} href="#connect-your-agent">{es ? "Conectar mi agente" : "Connect my agent"}<ArrowRight size={16} /></a><Link className={styles.sideSecondary} href="/mcp#compatibility">{es ? "Ver asistentes compatibles" : "See compatible assistants"}</Link>
          </article>
        </div>
      </section>
      <section className={styles.channels} id="connect-your-agent" aria-labelledby="agent-channels-heading">
        <h2 id="agent-channels-heading">{es ? "Dos formas de darle herramientas a tu agente." : "Two ways to equip your agent."}</h2>
        <p>{es ? "MCP conecta tu asistente al servidor. WebMCP conecta un agente a la página abierta, cuando el navegador lo permite. Las consultas públicas no necesitan cuenta de Magic Brain." : "MCP connects your assistant to the server. WebMCP connects an agent to the open page when the browser supports it. Public research needs no Magic Brain account."}</p>
        <div className={styles.channelGrid}>
          <article><span className={styles.channelLabel}>MCP</span><h3>{es ? "Desde tu asistente" : "From your assistant"}</h3><ol><li>{es ? "Elige Claude, ChatGPT, Grok, Gemini CLI u otro cliente compatible." : "Choose Claude, ChatGPT, Grok, Gemini CLI or another compatible client."}</li><li>{es ? "Sigue la configuración de ese cliente y añade la URL MCP." : "Follow that client’s setup and add the MCP URL."}</li><li>{es ? "Activa las herramientas y pregunta por una carta." : "Enable the tools and ask about a card."}</li></ol><Link href="/mcp#connect">{es ? "Configurar mi asistente" : "Set up my assistant"}<ArrowRight size={15} /></Link><Link href="/mcp#compatibility">{es ? "Compatibilidad, planes y vías de acceso" : "Compatibility, plans and connection routes"}</Link></article>
          <article className={styles.recommended}><span className={styles.channelLabel}>{es ? "WEBMCP · RECOMENDAMOS INSTINCT" : "WEBMCP · WE RECOMMEND INSTINCT"}</span><h3>{es ? "Lleva tu agente a la página" : "Bring your agent to the page"}</h3><ol><li>{es ? "Entra en Instinct con la invitación de Asier." : "Join Instinct with Asier’s invitation."}</li><li>{es ? "Abre Magic Brain en su navegador." : "Open Magic Brain in its browser."}</li><li>{es ? "Pide al agente que descubra y use las herramientas de la página." : "Ask the agent to discover and use the page’s tools."}</li></ol><a href={instinctInviteUrl}>{es ? "Entrar con la invitación de Asier" : "Join with Asier’s invitation"}<ArrowRight size={15} /></a><Link href="/webmcp#start">{es ? "Guía WebMCP y compatibilidad" : "WebMCP setup and compatibility"}</Link></article>
        </div>
        <p className={styles.developerRoute}>{es ? "¿Construyes tu propio agente? " : "Building your own agent? "}<Link href="/mcp#setup-api-cli">{es ? "Empieza con la API o la CLI" : "Start with the API or CLI"}</Link>{" · "}<Link href="/developers">{es ? "Desarrolladores" : "Developers"}</Link></p>
      </section>
      <section className="auth-onboarding">
        <div className="auth-onboarding-copy">
          <h2 className={styles.collectionHeading}>{es ? "Tus cartas. Sus reglas. Su historia." : "Your cards. Their rules. Their story."}</h2>
          <div className="auth-card-showcase" aria-label={es ? "Ejemplos de cartas analizadas" : "Examples of analysed cards"}>
            <div className="auth-card-stack">
              {movers.slice(0, 3).map((card, index) => (
                <img key={card.id} src={card.image} alt={`${card.name} — ${card.set}`} style={{ "--card-index": index } as React.CSSProperties} />
              ))}
            </div>
            <div className="auth-market-proof">
              <span><TrendingUp size={14} /> {es ? "Cada edición cuenta" : "Every printing matters"}</span>
              <strong>EUR</strong>
              <small>{es ? "Precios e histórico por impresión, con fuente y fecha." : "Prices and history by printing, with source and date."}</small>
            </div>
          </div>
          <div className="auth-benefits">
            <div><span><BarChart3 size={18} /></span><div><strong>{es ? "Entiende el precio antes del cambio" : "Understand the price before the trade"}</strong><small>{es ? "Compara ediciones, acabado foil e historial en EUR." : "Compare printings, foil finishes and EUR price history."}</small></div></div>
            <div><span><BookOpen size={18} /></span><div><strong>{es ? "Resuelve la duda en plena partida" : "Work through the question mid-game"}</strong><small>{es ? "Texto Oracle, rulings y reglas citadas para tu asistente." : "Oracle text, card rulings and cited rules for your assistant."}</small></div></div>
            <div><span><WalletCards size={18} /></span><div><strong>{es ? "Recuerda lo que ya tienes" : "Remember what you already own"}</strong><small>{es ? "Copias, coste de compra, valor y seguimiento en un solo sitio." : "Copies, purchase cost, value and watchlists in one place."}</small></div></div>
          </div>
        </div>

        <div className={`login-card signup-card ${styles.signup}`} id="start-collection" tabIndex={-1} aria-labelledby="start-collection-heading">
          <div className="login-mark"><MagicBrainMark size={42} /></div>
          <span className="eyebrow">{es ? "CREA TU CUENTA GRATIS" : "CREATE YOUR FREE ACCOUNT"}</span>
          <h2 id="start-collection-heading">{es ? "Dale memoria a tu colección." : "Give your collection a memory."}</h2>
          <p>{es ? "Guarda tus cartas, lo que pagaste y las que no quieres perder de vista. Tu colección te espera cuando vuelvas." : "Save your cards, what you paid and the ones you want to watch. Your collection will be here when you return."}</p>
          <label className="auth-legal-consent">
            <input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} />
            <span>{es ? <>Acepto los <Link href="/terms">Términos</Link> y confirmo que he leído la <Link href="/privacy">Política de privacidad</Link>.</> : <>I accept the <Link href="/terms">Terms</Link> and confirm I have read the <Link href="/privacy">Privacy Policy</Link>.</>}</span>
          </label>
          <button className="google-auth-cta" onClick={continueWithGoogle} disabled={loading || !acceptedTerms}>
            {loading ? <LoaderCircle className="spin" size={19} /> : <GoogleMark />}
            {loading ? (es ? "Conectando…" : "Connecting…") : es ? "Continuar con Google" : "Continue with Google"}
          </button>
          <NewsletterSignup compact />
          <ul>
            <li><Check size={13} /> {es ? "Registro e inicio de sesión en un paso" : "Sign up or sign in in one step"}</li>
            <li><Check size={13} /> {es ? "Tus datos sincronizados de forma segura" : "Your data securely synchronised"}</li>
            <li><Check size={13} /> {es ? "Sin contraseña adicional" : "No additional password"}</li>
          </ul>
          <div className="login-security"><ShieldCheck size={15} /> {es ? "Magic Brain nunca recibe tu contraseña de Google." : "Magic Brain never receives your Google password."}</div>
          <small className="auth-terms">{es ? "El boletín es opcional y requiere una suscripción separada." : "The newsletter is optional and requires a separate subscription."}</small>
        </div>
      </section>
      <section className="landing-card-chronicle" aria-labelledby="card-chronicle-heading">
        <div className="landing-chronicle-copy">
          <span className="eyebrow">{es ? "PARA LAS CONVERSACIONES DE TU MESA" : "FOR THE CONVERSATIONS AT YOUR TABLE"}</span>
          <h2 id="card-chronicle-heading">{es ? "«¿Cuánto vale?» «¿Cómo funciona?» «¿No tenía ya una?»" : "“What’s it worth?” “How does it work?” “Don’t I own one?”"}</h2>
          <p>{es ? "Las preguntas de siempre, con los datos a mano. Magic Brain conecta cartas, precios y reglas para que pases menos tiempo buscando y más tiempo disfrutando de Magic con tu grupo." : "The familiar questions, with the evidence close at hand. Magic Brain brings cards, prices and rules together so you spend less time searching and more time enjoying Magic with your group."}</p>
        </div>
        <div className="landing-card-river" aria-label={es ? "Selección de cartas de Magic: The Gathering" : "A selection of Magic: The Gathering cards"}>
          {storyCards.map((card, index) => (
            <figure key={`${card.id}-${index}`} style={{ "--river-index": index } as React.CSSProperties}>
              <img src={card.image} alt={`${card.name} — ${card.set}`} loading="lazy" />
              <figcaption><strong>{card.name}</strong><span>{card.set}</span></figcaption>
            </figure>
          ))}
        </div>
      </section>
      <section className="landing-product-story" aria-labelledby="product-story-heading">
        <div className="landing-product-heading">
          <span className="eyebrow">{es ? "TÚ PREGUNTAS. TU ASISTENTE BUSCA." : "YOU ASK. YOUR ASSISTANT LOOKS IT UP."}</span>
          <h2 id="product-story-heading">{es ? "Empieza con una pregunta de verdad." : "Start with a real question."}</h2>
          <p>{es ? "Conecta Magic Brain a un asistente compatible con MCP. Tu asistente elige la herramienta, consulta las fuentes y te explica el resultado en lenguaje normal." : "Connect Magic Brain to an assistant that supports MCP. Your assistant picks the tool, checks the sources and explains the result in plain language."}</p>
        </div>
        <div className="landing-product-grid">
          <article><div className="landing-story-card"><img src={storyCards[3].image} alt={storyCards[3].name} loading="lazy" /><span><Eye size={15} /> {es ? "Precios con contexto" : "Prices in context"}</span></div><i>01</i><BarChart3 size={21} /><h3>{es ? "Sigue la edición que te importa" : "Follow the printing you care about"}</h3><p>{es ? "Compara el precio actual con su historial, distingue normal de foil y comprueba cuándo se observó cada dato." : "Compare the latest price with its history, distinguish nonfoil from foil and see when each price was observed."}</p><blockquote className={styles.example}>{es ? "«¿Cuánto vale Beorn the Fierce de HOB y cómo se ha movido este mes?»" : "“What’s Beorn the Fierce from HOB worth, and how has its price moved this month?”"}</blockquote></article>
          <article><div className="landing-story-card"><img src={storyCards[4].image} alt={storyCards[4].name} loading="lazy" /><span><BookOpen size={15} /> {es ? "Cartas y rulings" : "Cards and rulings"}</span></div><i>02</i><MessageCircle size={21} /><h3>{es ? "Lleva las reglas a la conversación" : "Bring the rules into the conversation"}</h3><p>{es ? "Consulta el texto Oracle completo, los rulings de la carta y las reglas que ayudan a explicar una interacción." : "Look up complete Oracle text, card-specific rulings and the rules that help explain an interaction."}</p><blockquote className={styles.example}>{es ? "«Con Rest in Peace en mesa, ¿se dispara Blood Artist cuando una criatura fuera a morir? Cita las reglas.»" : "“With Rest in Peace on the battlefield, does Blood Artist trigger when a creature would die? Cite the rules.”"}</blockquote></article>
          <article><div className="landing-story-card"><img src={storyCards[5].image} alt={storyCards[5].name} loading="lazy" /><span><Layers3 size={15} /> {es ? "Tu colección" : "Your collection"}</span></div><i>03</i><WalletCards size={21} /><h3>{es ? "Ve lo que tienes, de un vistazo" : "See what you own at a glance"}</h3><p>{es ? "Reúne copias, coste de compra y valor estimado. Autoriza a tu asistente para consultar tus listas y entender dónde se concentra su valor." : "Bring copies, purchase cost and estimated value together. Authorize your assistant to read your lists and see where their value is concentrated."}</p><blockquote className={styles.example}>{es ? "«Valora mi colección y dime qué cartas concentran más valor.»" : "“Value my collection and show which cards account for most of it.”"}</blockquote></article>
        </div>
        <div className={styles.guideNext}><Link href="/mcp#connect">{es ? "Conectar mi asistente, paso a paso" : "Connect my assistant, step by step"}<ArrowRight size={16} /></Link><p>{es ? "Cartas, precios y reglas: acceso público. Tu colección: con autorización. Los cambios requieren confirmación." : "Cards, prices and rules are public. Your collection requires authorization. Changes require confirmation."}</p></div>
      </section>
      <section className="landing-final-chapter">
        <div className="landing-final-cards" aria-hidden="true">
          {storyCards.slice(0, 4).map((card, index) => <img key={card.id} src={card.image} alt="" loading="lazy" style={{ "--final-index": index } as React.CSSProperties} />)}
        </div>
        <div>
          <span className="eyebrow">{es ? "MENOS PESTAÑAS. MÁS MAGIC." : "FEWER TABS. MORE MAGIC."}</span>
          <h2>{es ? "Elijas el lado que elijas, juega con más contexto." : "Whichever side you choose, bring more context to the table."}</h2>
          <p>{es ? "Explora por tu cuenta o trae a tu agente. Magic Brain pone cartas, precios y reglas al servicio de tu próxima decisión." : "Explore on your own or bring your agent. Magic Brain puts cards, prices and rules behind your next decision."}</p>
          <div className={styles.actions}><Link href="/market-movers" className={styles.primaryAction}>{es ? "Explorar yo mismo" : "Explore it myself"}<ArrowRight size={16} /></Link><a href="#connect-your-agent" className={styles.secondaryAction}>{es ? "Conectar mi agente" : "Connect my agent"}</a></div>
        </div>
      </section>
      <section className="landing-developers" aria-labelledby="landing-developers-heading">
        <div className="landing-developers-mark" aria-hidden="true"><Code2 size={34} /></div>
        <div className="landing-developers-copy">
          <span className="eyebrow">{es ? "ABIERTO A TUS IDEAS" : "OPEN TO YOUR IDEAS"}</span>
          <h2 id="landing-developers-heading">{es ? "Código abierto. Más formas de disfrutar Magic." : "Open source. More ways to enjoy Magic."}</h2>
          <p>{es ? "Consulta el código, comprueba las fuentes y construye sobre Magic Brain. Usa la API en tu proyecto, conecta un asistente con MCP o descubre las herramientas del navegador con WebMCP." : "Read the code, check the sources and build on Magic Brain. Use the API in your project, connect an assistant through MCP or explore the browser tools with WebMCP."}</p>
          <div className="landing-developer-tags"><Link href="https://github.com/assarasua/magic-brain">{es ? "Código en GitHub" : "Code on GitHub"} ↗</Link><span>REST API</span><Link href="/mcp">{es ? "Guía MCP" : "MCP guide"} ↗</Link><Link href="/webmcp">{es ? "Guía WebMCP" : "WebMCP guide"} ↗</Link></div>
        </div>
        <Link href="/developers" className="landing-developers-cta">{es ? "Para desarrolladores" : "For developers"}<ArrowRight size={16} /></Link>
        <Braces className="landing-developers-braces" size={160} aria-hidden="true" />
      </section>
      <LandingContact />
      <footer className="creator-credit">
        <p className={styles.sourceNote}>{es ? "Hecho para gente de Magic. Los precios reflejan observaciones de sus fuentes; comprueba el precio final antes de comprar o vender." : "Made for Magic people. Prices reflect source observations; check the final price before buying or selling."}</p>
        <nav className="landing-footer-guides" aria-label={es ? "Recursos" : "Resources"}>
          <Link href="/developers">{es ? "Desarrolladores" : "Developers"}</Link>
          <Link href="/mcp">{es ? "Guía MCP" : "MCP guide"}</Link>
          <Link href="/webmcp">{es ? "Guía WebMCP" : "WebMCP guide"}</Link>
        </nav>
        {es ? "Creado por " : "Created by "}
        <a href="https://bizkardolab.eu" target="_blank" rel="noreferrer">
          Asier Sarasua · BizkardoLab
        </a>
        <span className="legal-footer-links"><Link href="/privacy">{es ? "Privacidad" : "Privacy"}</Link><Link href="/cookies">Cookies</Link><Link href="/terms">{es ? "Términos" : "Terms"}</Link></span>
      </footer>
    </main>
  );
}
