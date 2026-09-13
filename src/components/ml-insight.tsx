"use client";

import { Bell, BrainCircuit, ChevronDown, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type {
  MlCardContext,
  MlRankingStatus,
} from "@/lib/ml-experience";
import type {
  MlFeedbackEventType,
  MlFeedbackSurface,
} from "@/lib/ml-feedback-contract";
import styles from "./ml-insight.module.css";

type Locale = "en" | "es";

const featureLabels: Record<string, { en: string; es: string }> = {
  momentum7d: { en: "7-day momentum", es: "momentum a 7 días" },
  momentum30d: { en: "30-day momentum", es: "momentum a 30 días" },
  momentum90d: { en: "90-day momentum", es: "momentum a 90 días" },
  volatility30d: { en: "price stability", es: "estabilidad del precio" },
  drawdown90d: { en: "recent drawdown", es: "caída reciente" },
  logPriceEur: { en: "price fit", es: "ajuste de precio" },
  historyDays: { en: "history depth", es: "profundidad histórica" },
  observations90d: { en: "data coverage", es: "cobertura de datos" },
  setAgeDays: { en: "set age", es: "antigüedad de la edición" },
  isReserved: { en: "Reserved List status", es: "estado Reserved List" },
};

export function trackMlFeedback(input: {
  eventType: MlFeedbackEventType;
  surface: MlFeedbackSurface;
  cardId: string;
  context?: MlCardContext;
  rankPosition?: number;
  alertAction?: "open" | "dismiss" | "save";
}) {
  const payload = JSON.stringify({
    eventId: crypto.randomUUID(),
    eventType: input.eventType,
    surface: input.surface,
    cardId: input.cardId,
    occurredAt: new Date().toISOString(),
    scoreId: input.context?.scoreId ?? null,
    modelVersion: input.context?.modelVersion ?? null,
    rankPosition: input.rankPosition ?? null,
    alertAction: input.alertAction ?? null,
  });
  if (typeof navigator !== "undefined" && navigator.sendBeacon) {
    navigator.sendBeacon(
      "/api/ml/feedback",
      new Blob([payload], { type: "application/json" }),
    );
    return;
  }
  void fetch("/api/ml/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true,
  });
}

export function MlInsight({
  locale,
  ranking,
  context,
  surface,
  cardId,
  rankPosition,
  onDismiss,
  onCreateAlert,
}: {
  locale: Locale;
  ranking: MlRankingStatus;
  context?: MlCardContext;
  surface: MlFeedbackSurface;
  cardId?: string;
  rankPosition?: number;
  onDismiss?: () => void;
  onCreateAlert?: () => void;
}) {
  const es = locale === "es";
  const detailsId = useId();
  const [expanded, setExpanded] = useState(false);
  const recorded = useRef(false);

  useEffect(() => {
    if (!cardId || !context || recorded.current) return;
    recorded.current = true;
    trackMlFeedback({
      eventType: "impression",
      surface,
      cardId,
      context,
      rankPosition,
    });
  }, [cardId, context, rankPosition, surface]);

  const fallback = ranking.source === "deterministic" || !context;
  const confidence = context
    ? context.confidence >= 0.8
      ? es ? "Alta" : "High"
      : es ? "Moderada" : "Moderate"
    : null;
  const fallbackReason =
    ranking.reason === "scores_missing_or_stale"
      ? es ? "Sin puntuación aprendida reciente y segura" : "No recent, safe learned score"
      : es ? "Personalización aprendida no activa" : "Learned personalisation is not active";

  return (
    <aside className={styles.insight} data-source={fallback ? "baseline" : "ml"}>
      <div className={styles.summary}>
        <BrainCircuit size={14} aria-hidden="true" />
        <strong>{fallback ? (es ? "Método: reglas transparentes" : "Method: transparent rules") : (es ? "Orden personalizado" : "Personalised ranking")}</strong>
        <span>
          {fallback
            ? fallbackReason
            : `${es ? "Confianza" : "Confidence"}: ${confidence} · ${es ? "datos" : "data"} ${ranking.scoreDate}`}
        </span>
        {context && (
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={detailsId}
            onClick={() => {
              setExpanded((value) => !value);
              if (!expanded && cardId) {
                trackMlFeedback({
                  eventType: "open_details",
                  surface,
                  cardId,
                  context,
                  rankPosition,
                });
              }
            }}
          >
            {es ? "Por qué" : "Why this card"} <ChevronDown size={13} />
          </button>
        )}
      </div>
      {expanded && context && (
        <div id={detailsId} className={styles.details}>
          <span>
            {es ? "Principales impulsores" : "Top drivers"}:{" "}
            {context.drivers.map((driver) => featureLabels[driver.feature]?.[locale] ?? driver.feature).join(" · ")}
          </span>
          <small>
            {es ? "Modelo verificado" : "Verified model"} {context.modelVersion} ·{" "}
            {es ? "generado" : "generated"} {new Date(context.generatedAt).toLocaleDateString(locale)}
          </small>
          {(onCreateAlert || onDismiss) && (
            <div className={styles.actions}>
              {onCreateAlert && cardId && (
                <button type="button" onClick={onCreateAlert}>
                  <Bell size={13} /> {es ? "Alerta inteligente" : "Smart alert"}
                </button>
              )}
              {onDismiss && cardId && (
                <button
                  type="button"
                  onClick={() => {
                    trackMlFeedback({
                      eventType: "dismiss",
                      surface,
                      cardId,
                      context,
                      rankPosition,
                    });
                    onDismiss();
                  }}
                >
                  <X size={13} /> {es ? "No me interesa" : "Not relevant"}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
