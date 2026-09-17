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

export function LandingContact() {
  const { locale } = useLanguage();
  const es = locale === "es";
  const [contactState, setContactState] = useState<FormState>("idle");
  const [newsletterState, setNewsletterState] = useState<FormState>("idle");

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

  const subscribe = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    setNewsletterState("sending");
    try {
      await submit("/api/newsletter", Object.fromEntries(new FormData(form)) as Record<string, string>);
      form.reset();
      setNewsletterState("success");
    } catch {
      setNewsletterState("error");
    }
  };

  return (
    <section className="landing-connect" aria-labelledby="contact-heading">
      <div className="landing-newsletter">
        <span className="panel-kicker"><Mail size={14} /> {es ? "NEWSLETTER" : "NEWSLETTER"}</span>
        <h2>{es ? "La señal útil, sin ruido." : "The useful signal, without the noise."}</h2>
        <p>{es ? "Recibe novedades de Magic Brain, análisis del mercado de cartas de Magic: The Gathering y nuevas herramientas." : "Get Magic Brain updates, Magic: The Gathering card-market analysis, and newly released tools."}</p>
        <form onSubmit={subscribe}>
          <label htmlFor="newsletter-email">{es ? "Tu email" : "Your email"}</label>
          <div>
            <input id="newsletter-email" name="email" type="email" autoComplete="email" required maxLength={254} placeholder="you@example.com" />
            <button type="submit" disabled={newsletterState === "sending" || newsletterState === "success"}>
              {newsletterState === "success" ? <Check size={16} /> : <ArrowRight size={16} />}
              {newsletterState === "sending" ? (es ? "Enviando…" : "Sending…") : newsletterState === "success" ? (es ? "Suscrito" : "Subscribed") : (es ? "Suscribirme" : "Subscribe")}
            </button>
          </div>
          <input className="form-honeypot" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
          <small>{es ? "Puedes darte de baja en cualquier momento. Sin spam." : "Unsubscribe at any time. No spam."}</small>
          {newsletterState === "error" && <p className="form-error" role="alert">{es ? "No hemos podido completar la suscripción. Inténtalo de nuevo." : "We could not complete the subscription. Please try again."}</p>}
        </form>
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
