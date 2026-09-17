"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { useLanguage } from "@/components/language-provider";

const CONSENT_KEY = "magic-brain-cookie-consent-v1";

function persistReferral() {
  const referral = window.sessionStorage.getItem("magic-brain-pending-referral");
  if (/^[a-f0-9]{12}$/.test(referral ?? "")) {
    document.cookie = `magic_brain_referral=${referral}; Max-Age=2592000; Path=/; SameSite=Lax; Secure`;
    window.sessionStorage.removeItem("magic-brain-pending-referral");
  }
}

export function CookieConsent() {
  const { locale } = useLanguage();
  const visible = useSyncExternalStore(
    (onStoreChange) => {
      window.addEventListener("magic-brain-cookie-consent", onStoreChange);
      window.addEventListener("storage", onStoreChange);
      return () => {
        window.removeEventListener("magic-brain-cookie-consent", onStoreChange);
        window.removeEventListener("storage", onStoreChange);
      };
    },
    () => !window.localStorage.getItem(CONSENT_KEY),
    () => false,
  );
  const es = locale === "es";

  const choose = (value: "necessary" | "all") => {
    window.localStorage.setItem(CONSENT_KEY, value);
    if (value === "all") persistReferral();
    else document.cookie = "magic_brain_referral=; Max-Age=0; Path=/; SameSite=Lax; Secure";
    window.dispatchEvent(new Event("magic-brain-cookie-consent"));
  };

  if (!visible) return null;
  return (
    <aside className="cookie-consent" role="dialog" aria-live="polite" aria-label={es ? "Preferencias de cookies" : "Cookie preferences"}>
      <div><strong>{es ? "Tú decides sobre las cookies" : "You decide about cookies"}</strong><p>{es ? "Usamos almacenamiento necesario para iniciar sesión, guardar el idioma y recordar el tour. Solo con tu permiso guardamos la atribución de referidos; no usamos cookies publicitarias ni analíticas." : "We use necessary storage for sign-in, language, and tour preferences. Only with your permission do we store referral attribution; we do not use advertising or analytics cookies."}</p><Link href="/cookies">{es ? "Ver política de cookies" : "Read cookie policy"}</Link></div>
      <div className="cookie-actions"><button className="secondary" onClick={() => choose("necessary")}>{es ? "Solo necesarias" : "Necessary only"}</button><button onClick={() => choose("all")}>{es ? "Permitir referidos" : "Allow referral"}</button></div>
    </aside>
  );
}
