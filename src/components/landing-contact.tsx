"use client";

import { ArrowRight, Check, Mail, Send } from "lucide-react";
import { FormEvent, useState } from "react";
import { useLanguage } from "@/components/language-provider";

type FormState = "idle" | "sending" | "success" | "error";

async function submit(path: string, body: Record<string, string>) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error("Request failed");
}

export function NewsletterSignup({ compact = false }: { compact?: boolean }) {
  const { locale } = useLanguage();
  const es = locale === "es";
  const [state, setState] = useState<FormState>("idle");
  const id = compact ? "hero-newsletter-email" : "newsletter-email";

  const subscribe = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    setState("sending");
    try {
      await submit("/api/newsletter", Object.fromEntries(new FormData(form)) as Record<string, string>);
      form.reset();
      setState("success");
    } catch {
      setState("error");
    }
  };

  return (
    <form className={compact ? "hero-newsletter-form" : undefined} onSubmit={subscribe}>
      <label htmlFor={id}>{compact ? (es ? "O recibe el brief diario" : "Or get the daily brief") : (es ? "Tu email" : "Your email")}</label>
      <div>
        <input id={id} name="email" type="email" autoComplete="email" required maxLength={254} placeholder="you@example.com" />
        <button type="submit" disabled={state === "sending" || state === "success"}>
          {state === "success" ? <Check size={16} /> : <ArrowRight size={16} />}
          {state === "sending" ? (es ? "Enviando…" : "Sending…") : state === "success" ? (es ? "Suscrito" : "Subscribed") : (es ? "Suscribirme" : "Subscribe")}
        </button>
      </div>
      <input className="form-honeypot" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      <small>{es ? "Noticias y movimientos de cartas cada mañana." : "Card news and market moves every morning."}</small>
      {state === "error" && <p className="form-error" role="alert">{es ? "No hemos podido completar la suscripción." : "We could not complete the subscription."}</p>}
    </form>
  );
}

export function LandingContact() {
  const { locale } = useLanguage();
  const es = locale === "es";
  const [contactState, setContactState] = useState<FormState>("idle");

  const sendContact = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    setContactState("sending");
    try {
      await submit("/api/contact", Object.fromEntries(new FormData(form)) as Record<string, string>);
      form.reset();
      setContactState("success");
    } catch {
      setContactState("error");
    }
  };

  return (
    <section className="landing-connect" aria-labelledby="contact-heading">
      <div className="landing-newsletter">
        <span className="panel-kicker"><Mail size={14} /> {es ? "NEWSLETTER" : "NEWSLETTER"}</span>
        <h2>{es ? "La señal útil, sin ruido." : "The useful signal, without the noise."}</h2>
        <p>{es ? "Recibe novedades de Magic Brain, análisis del mercado de cartas de Magic: The Gathering y nuevas herramientas." : "Get Magic Brain updates, Magic: The Gathering card-market analysis, and newly released tools."}</p>
        <NewsletterSignup />
      </div>

      <div className="landing-contact-card">
        <span className="panel-kicker"><Send size={14} /> {es ? "CONTACTO" : "CONTACT"}</span>
        <h2 id="contact-heading">{es ? "Hablemos de Magic." : "Let’s talk Magic."}</h2>
        <p>{es ? "¿Tienes una idea, una pregunta sobre los datos o una propuesta para Magic Brain? Escríbenos." : "Have an idea, a data question, or a proposal for Magic Brain? Send us a note."}</p>
        <form onSubmit={sendContact}>
          <div className="contact-form-row">
            <label>{es ? "Nombre" : "Name"}<input name="name" autoComplete="name" required minLength={2} maxLength={100} /></label>
            <label>Email<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
          </div>
          <label>{es ? "Asunto" : "Subject"}<input name="subject" maxLength={140} /></label>
          <label>{es ? "Mensaje" : "Message"}<textarea name="message" required minLength={10} maxLength={4000} rows={5} /></label>
          <input className="form-honeypot" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
          <div className="contact-form-submit">
            <small>{es ? "Al enviar aceptas que usemos tus datos para responderte." : "By sending, you agree that we may use your details to reply."}</small>
            <button type="submit" disabled={contactState === "sending"}>
              {contactState === "success" ? <Check size={16} /> : <Send size={16} />}
              {contactState === "sending" ? (es ? "Enviando…" : "Sending…") : contactState === "success" ? (es ? "Mensaje enviado" : "Message sent") : (es ? "Enviar mensaje" : "Send message")}
            </button>
          </div>
          {contactState === "error" && <p className="form-error" role="alert">{es ? "No hemos podido enviar el mensaje. Inténtalo de nuevo." : "We could not send the message. Please try again."}</p>}
        </form>
      </div>
    </section>
  );
}
