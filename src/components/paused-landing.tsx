"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Bell, Check, Pause, ArrowUpRight } from "lucide-react";
import { useState, type FormEvent } from "react";
import { MagicBrainLogo } from "@/components/brand-logo";
import { LanguageToggle, useLanguage } from "@/components/language-provider";
import styles from "./paused-landing.module.css";

const copy = {
  es: {
    status: "EN PAUSA · VOLVEREMOS", title: "La próxima jugada", accent: "está por venir.",
    intro: "Magic Brain se toma una pausa. Cartas, precios y colección: volveremos a reunirlo todo para que disfrutes más de Magic.",
    label: "Tu email", placeholder: "tu@email.com", subscribe: "Avísame cuando volváis", sending: "Guardando…",
    success: "Ya estás en la lista.", successDetail: "Te avisaremos por email cuando haya novedades. Gracias por seguir aquí.",
    error: "No hemos podido guardar tu email. Inténtalo de nuevo en unos minutos.",
    consent: "Quiero recibir novedades de Magic Brain y el aviso de reapertura. He leído la", privacy: "política de privacidad",
    note: "Sin spam. Puedes darte de baja en cualquier momento.", previewLink: "Echa un vistazo", eyebrow: "UN VISTAZO A MAGIC BRAIN",
    previewTitle: "Tu Magic, con más contexto.", previewIntro: "Capturas de la web antes de la pausa. Las funciones que ves aquí están temporalmente deshabilitadas.",
    features: ["Cartas y precios", "Tu colección", "Tu asistente de Magic"],
    cards: "Cada carta tiene su historia.", cardsDetail: "Ediciones, precios y reglas, juntos para entender mejor tus cartas.",
    assistant: "Un cerebro extra en tu mesa.", assistantDetail: "La información de Magic Brain, al alcance de tu asistente.",
    paused: "Por ahora solo está abierta la suscripción a novedades. El acceso, las herramientas y las integraciones están en pausa.",
    existing: "¿Ya tenías una cuenta? Tus datos se conservan durante la pausa.",
    footer: "Hecho para gente de Magic.", contact: "Contacto", terms: "Términos", cookies: "Cookies", legal: "Magic Brain no está afiliado a Wizards of the Coast.",
    mainAlt: "Captura de la portada anterior de Magic Brain, con las opciones de colección y asistente", cardsAlt: "Captura de Magic Brain con cartas de Magic y sus funciones de precios y reglas", assistantAlt: "Captura de la guía de Magic Brain para asistentes de IA", archived: "VISTA PREVIA · FUNCIONES EN PAUSA",
  },
  en: {
    status: "ON PAUSE · WE’LL BE BACK", title: "Our next move", accent: "is still to come.",
    intro: "Magic Brain is taking a break. Cards, prices and your collection: we’ll bring it all together again, so you can enjoy more Magic.",
    label: "Your email", placeholder: "you@email.com", subscribe: "Let me know when you’re back", sending: "Saving…",
    success: "You’re on the list.", successDetail: "We’ll email you when there’s news. Thanks for sticking around.",
    error: "We couldn’t save your email. Please try again in a few minutes.",
    consent: "I’d like Magic Brain updates and a reopening announcement. I’ve read the", privacy: "privacy policy",
    note: "No spam. Unsubscribe at any time.", previewLink: "Take a look", eyebrow: "A LOOK AT MAGIC BRAIN",
    previewTitle: "Your Magic, with more context.", previewIntro: "Screenshots from before the pause. The features shown here are temporarily disabled.",
    features: ["Cards & prices", "Your collection", "Your Magic assistant"],
    cards: "Every card has a story.", cardsDetail: "Printings, prices and rules, together to help you understand your cards.",
    assistant: "An extra brain at your table.", assistantDetail: "Magic Brain’s information, within your assistant’s reach.",
    paused: "Only email signups are open for now. Account access, tools and integrations are on pause.",
    existing: "Already have an account? Your data is preserved during the pause.",
    footer: "Made for Magic people.", contact: "Contact", terms: "Terms", cookies: "Cookies", legal: "Magic Brain is not affiliated with Wizards of the Coast.",
    mainAlt: "Screenshot of Magic Brain’s previous homepage with collection and assistant options", cardsAlt: "Screenshot of Magic Brain with Magic cards and its price and rules features", assistantAlt: "Screenshot of the Magic Brain guide for AI assistants", archived: "PREVIEW · FEATURES ON PAUSE",
  },
};

export function PausedLanding() {
  const { locale } = useLanguage();
  const c = copy[locale];
  const [state, setState] = useState<"idle" | "sending" | "success" | "error">("idle");
  async function subscribe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "sending" || state === "success") return;
    const form = event.currentTarget;
    setState("sending");
    try {
      const response = await fetch("/api/newsletter", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      if (!response.ok) throw new Error("Subscription unavailable");
      setState("success");
    } catch { setState("error"); }
  }
  return (
    <div className={styles.page}>
      <a className={styles.skipLink} href="#main">{locale === "es" ? "Saltar al contenido" : "Skip to content"}</a>
      <header className={styles.header}>
        <Link href="/" aria-label="Magic Brain"><MagicBrainLogo /></Link>
        <LanguageToggle />
      </header>
      <main id="main">
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.heroCopy}>
            <span className={styles.status}><span />{c.status}</span>
            <h1 id="hero-title">{c.title}<br /><span>{c.accent}</span></h1>
            <p className={styles.intro}>{c.intro}</p>
            <div className={styles.signup} id="subscribe">
              {state === "success" ? <div className={styles.success} role="status"><Check size={24} /><div><h2>{c.success}</h2><p>{c.successDetail}</p></div></div> : (
                <form onSubmit={subscribe} aria-busy={state === "sending"}>
                  <label className={styles.emailLabel} htmlFor="pause-email">{c.label}</label>
                  <div className={styles.emailRow}>
                    <input id="pause-email" name="email" type="email" autoComplete="email" placeholder={c.placeholder} maxLength={254} required aria-describedby="signup-note signup-error" disabled={state === "sending"} />
                    <button type="submit" disabled={state === "sending"}>{state === "sending" ? c.sending : c.subscribe}<ArrowRight size={17} aria-hidden="true" /></button>
                  </div>
                  <label className={styles.consent}><input type="checkbox" required name="consent" value="yes" disabled={state === "sending"} /><span>{c.consent} <Link href="/privacy">{c.privacy}</Link>.</span></label>
                  <input className={styles.honeypot} name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" aria-label="Website" />
                  <p id="signup-error" className={styles.error} role="alert">{state === "error" ? c.error : ""}</p>
                  <p id="signup-note" className={styles.note}><Bell size={13} aria-hidden="true" />{c.note}</p>
                </form>
              )}
            </div>
            <a href="#preview" className={styles.previewLink}>{c.previewLink}<ArrowUpRight size={16} /></a>
          </div>
          <div className={styles.heroVisual}>
            <div className={styles.halo} />
            <figure className={styles.browserFrame}>
              <div className={styles.browserBar}><span className={styles.dots}><i /><i /><i /></span><span>magicbrain.es</span><Pause size={12} /></div>
              <Image src="/previews/magic-brain.jpg" alt={c.mainAlt} width={1120} height={760} priority unoptimized />
              <figcaption><Pause size={12} />{c.archived}</figcaption>
            </figure>
            <div className={styles.featureStrip}>{c.features.map((feature, index) => <span key={feature}><i>0{index + 1}</i>{feature}</span>)}</div>
          </div>
        </section>
        <section className={styles.previews} id="preview" aria-labelledby="preview-title">
          <div className={styles.sectionHead}><span>{c.eyebrow}</span><h2 id="preview-title">{c.previewTitle}</h2><p>{c.previewIntro}</p></div>
          <div className={styles.previewGrid}>
            <figure className={styles.previewCard}><div className={styles.cardImage}><Image src="/previews/cards-and-prices.jpg" alt={c.cardsAlt} width={1120} height={370} unoptimized /></div><figcaption><h3>{c.cards}</h3><p>{c.cardsDetail}</p></figcaption></figure>
            <figure className={styles.previewCard}><div className={`${styles.cardImage} ${styles.assistantImage}`}><Image src="/previews/assistant.jpg" alt={c.assistantAlt} width={1320} height={760} unoptimized /></div><figcaption><h3>{c.assistant}</h3><p>{c.assistantDetail}</p></figcaption></figure>
          </div>
        </section>
        <aside className={styles.pauseNotice}><Pause size={18} aria-hidden="true" /><div><p>{c.paused}</p><small>{c.existing}</small></div></aside>
      </main>
      <footer className={styles.footer}><div><strong>Magic Brain</strong><span>{c.footer}</span></div><nav aria-label={locale === "es" ? "Información legal" : "Legal information"}><Link href="/privacy">{locale === "es" ? "Privacidad" : "Privacy"}</Link><Link href="/cookies">{c.cookies}</Link><Link href="/terms">{c.terms}</Link><a href="mailto:assarasua@gmail.com">{c.contact}</a></nav><small>{c.legal}</small></footer>
    </div>
  );
}
