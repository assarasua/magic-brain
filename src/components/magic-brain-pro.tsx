"use client";

import { Crown, Sparkles } from "lucide-react";
import { useLanguage } from "@/components/language-provider";

export function ProBadge({ compact = false }: { compact?: boolean }) {
  const { locale } = useLanguage();

  return (
    <span className={`magic-pro-badge${compact ? " compact" : ""}`}>
      <Crown size={compact ? 10 : 13} aria-hidden="true" />
      <span>{compact ? "Pro" : "Magic Brain Pro"}</span>
      {!compact && (
        <small>{locale === "es" ? "Acceso anticipado" : "Early access"}</small>
      )}
    </span>
  );
}

export function ProNotice() {
  const { locale } = useLanguage();
  const es = locale === "es";

  return (
    <aside className="magic-pro-notice" aria-label="Magic Brain Pro">
      <span className="magic-pro-notice-icon">
        <Sparkles size={17} aria-hidden="true" />
      </span>
      <p>
        <strong>Magic Brain Pro</strong>{" "}
        {es
          ? "reúne predicción avanzada, señales personalizadas, inteligencia automatizada de carteras y análisis más profundos."
          : "brings together advanced prediction, personalised signals, automated portfolio intelligence, and deeper analysis."}{" "}
        <em>
          {es
            ? "Actualmente es gratis para usuarios pioneros."
            : "It is currently free for early adopters."}
        </em>
      </p>
    </aside>
  );
}
