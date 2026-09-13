"use client";

import {
  Check,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import {
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { useLanguage } from "@/components/language-provider";
import { ProductTour } from "@/components/product-tour";
import { CARD_COLORS, CARD_RARITIES, CARD_TYPES } from "@/lib/card-filters";
import {
  parseUserPreferences,
  type UserPreferences,
} from "@/lib/user-preferences";

type AccountOnboardingState = {
  preferencesOnboardingCompleted: boolean;
  productTourCompleted: boolean;
  preferences: UserPreferences;
};

const risks: UserPreferences["risk"][] = [
  "preservation",
  "conservative",
  "balanced",
  "growth",
  "aggressive",
];
const strategies: UserPreferences["strategy"][] = [
  "diversified",
  "momentum",
  "stability",
  "collectible",
];
const colours = CARD_COLORS.map((value) => ({
  value,
  label: { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green" }[value],
  symbol: { W: "☀", U: "💧", B: "●", R: "🔥", G: "🌿" }[value],
}));

function RequiredDialog({
  account,
  onComplete,
}: {
  account: AccountOnboardingState;
  onComplete: (account: AccountOnboardingState) => void;
}) {
  const { locale } = useLanguage();
  const es = locale === "es";
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [preferences, setPreferences] = useState(account.preferences);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const update = <K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K],
  ) => setPreferences((current) => ({ ...current, [key]: value }));

  const toggle = (
    key: "colors" | "rarities" | "cardTypes",
    value: string,
  ) => {
    const values = preferences[key];
    update(
      key,
      values.includes(value)
        ? values.filter((item) => item !== value)
        : [...values, value],
    );
  };

  const handleDialogKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setMessage(
        es
          ? "Completa y guarda tus preferencias para continuar."
          : "Complete and save your preferences to continue.",
      );
      titleRef.current?.focus();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      "button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex='-1'])",
    );
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const validPreferences = parseUserPreferences(preferences);
    if (!validPreferences) {
      setMessage(
        es
          ? "Revisa los límites. El máximo por carta no puede superar el presupuesto."
          : "Check the limits. Maximum card price cannot exceed the budget.",
      );
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: validPreferences }),
      });
      const result = (await response.json().catch(() => null)) as
        | Partial<AccountOnboardingState> & { error?: string }
        | null;
      if (
        !response.ok ||
        result?.preferencesOnboardingCompleted !== true ||
        !result.preferences
      ) {
        throw new Error(result?.error);
      }
      onComplete({
        ...account,
        preferences: result.preferences,
        preferencesOnboardingCompleted: true,
      });
    } catch {
      setMessage(
        es
          ? "No se pudieron guardar tus preferencias. Revisa tu conexión e inténtalo de nuevo."
          : "We couldn't save your preferences. Check your connection and try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const riskLabel = (value: UserPreferences["risk"]) =>
    es
      ? {
          preservation: "Preservación",
          conservative: "Conservador",
          balanced: "Equilibrado",
          growth: "Crecimiento",
          aggressive: "Agresivo",
        }[value]
      : `${value[0].toUpperCase()}${value.slice(1)}`;
  const strategyLabel = (value: UserPreferences["strategy"]) =>
    es
      ? {
          diversified: "Diversificado",
          momentum: "Momentum",
          stability: "Estabilidad",
          collectible: "Coleccionismo",
        }[value]
      : `${value[0].toUpperCase()}${value.slice(1)}`;

  return (
    <div className="preferences-onboarding-overlay">
      <div
        ref={dialogRef}
        className="preferences-onboarding"
        role="dialog"
        aria-modal="true"
        aria-labelledby="preferences-onboarding-title"
        aria-describedby="preferences-onboarding-description preferences-onboarding-status"
        onKeyDown={handleDialogKeyDown}
      >
        <header>
          <span><Sparkles size={19} /></span>
          <div>
            <small>{es ? "CONFIGURACIÓN OBLIGATORIA" : "REQUIRED SETUP"}</small>
            <h1 id="preferences-onboarding-title" ref={titleRef} tabIndex={-1}>
              {es ? "Personaliza tu experiencia." : "Personalise your experience."}
            </h1>
            <p id="preferences-onboarding-description">
              {es
                ? "Define tus límites y objetivos antes de entrar. Podrás cambiarlos más tarde en Ajustes."
                : "Set your limits and goals before entering. You can change them later in Settings."}
            </p>
          </div>
        </header>

        <form onSubmit={save}>
          <div className="preferences-onboarding-grid">
            <fieldset>
              <legend><ShieldCheck size={16} /> {es ? "Perfil inversor" : "Investor profile"}</legend>
              <label>{es ? "Nivel de riesgo" : "Risk level"}</label>
              <div className="preference-choice five">
                {risks.map((value) => (
                  <button
                    type="button"
                    key={value}
                    className={preferences.risk === value ? "active" : ""}
                    aria-pressed={preferences.risk === value}
                    onClick={() => update("risk", value)}
                  >
                    <strong>{riskLabel(value)}</strong>
                  </button>
                ))}
              </div>

              <label>{es ? "Horizonte temporal" : "Time horizon"}</label>
              <div className="preference-choice three">
                {(["short", "medium", "long"] as const).map((value) => (
                  <button
                    type="button"
                    key={value}
                    className={preferences.horizon === value ? "active" : ""}
                    aria-pressed={preferences.horizon === value}
                    onClick={() => update("horizon", value)}
                  >
                    <strong>{es ? { short: "Corto", medium: "Medio", long: "Largo" }[value] : value}</strong>
                    <small>{value === "short" ? "< 6m" : value === "medium" ? "6–18m" : "18m+"}</small>
                  </button>
                ))}
              </div>

              <label>{es ? "Estrategia" : "Strategy"}</label>
              <div className="preference-choice two">
                {strategies.map((value) => (
                  <button
                    type="button"
                    key={value}
                    className={preferences.strategy === value ? "active" : ""}
                    aria-pressed={preferences.strategy === value}
                    onClick={() => update("strategy", value)}
                  >
                    <strong>{strategyLabel(value)}</strong>
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend><SlidersHorizontal size={16} /> {es ? "Límites y mercado" : "Limits and market"}</legend>
              <div className="onboarding-number-grid">
                <label>
                  {es ? "Presupuesto predeterminado" : "Default budget"}
                  <span>€<input aria-label={es ? "Presupuesto predeterminado en euros" : "Default budget in euros"} type="number" min="25" max="1000000" required value={preferences.defaultBudget} onChange={(event) => update("defaultBudget", Number(event.target.value))} /></span>
                </label>
                <label>
                  {es ? "Máximo por carta" : "Maximum card price"}
                  <span>€<input aria-label={es ? "Máximo por carta en euros" : "Maximum card price in euros"} type="number" min="2" max={preferences.defaultBudget} required value={preferences.maxCardPrice} onChange={(event) => update("maxCardPrice", Number(event.target.value))} /></span>
                </label>
                <label>
                  {es ? "Posiciones" : "Positions"}
                  <input type="number" min="3" max="20" step="1" required value={preferences.positions} onChange={(event) => update("positions", Number(event.target.value))} />
                </label>
              </div>
              <label htmlFor="onboarding-market-trend">{es ? "Tendencia objetivo" : "Target market trend"}</label>
              <select id="onboarding-market-trend" value={preferences.marketTrend} onChange={(event) => update("marketTrend", event.target.value as UserPreferences["marketTrend"])}>
                <option value="any">{es ? "Cualquier tendencia" : "Any trend"}</option>
                <option value="rising">{es ? "Subida confirmada" : "Confirmed growth"}</option>
                <option value="stable">{es ? "Precio estable" : "Stable pricing"}</option>
                <option value="recovering">{es ? "En recuperación" : "Recovering"}</option>
              </select>
              <label htmlFor="onboarding-release-era">{es ? "Época de edición (opcional)" : "Release era (optional)"}</label>
              <select id="onboarding-release-era" value={preferences.releaseEra} onChange={(event) => update("releaseEra", event.target.value as UserPreferences["releaseEra"])}>
                <option value="any">{es ? "Todas las épocas" : "All eras"}</option>
                <option value="classic">{es ? "Clásica · antes de 2004" : "Classic · before 2004"}</option>
                <option value="established">{es ? "Consolidada · 2004–2018" : "Established · 2004–2018"}</option>
                <option value="recent">{es ? "Reciente · 2019+" : "Recent · 2019+"}</option>
              </select>
            </fieldset>
          </div>

          <fieldset className="onboarding-card-options">
            <legend><Sparkles size={16} /> {es ? "Preferencias de cartas (opcionales)" : "Card preferences (optional)"}</legend>
            <div>
              <section>
                <label>{es ? "Colores" : "Colours"}</label>
                <div className="settings-colours">
                  {colours.map((colour) => (
                    <button type="button" key={colour.value} title={colour.label} aria-label={colour.label} aria-pressed={preferences.colors.includes(colour.value)} className={preferences.colors.includes(colour.value) ? "active" : ""} onClick={() => toggle("colors", colour.value)}>{colour.symbol}</button>
                  ))}
                </div>
              </section>
              <section>
                <label>{es ? "Rarezas" : "Rarities"}</label>
                <div className="settings-chips">
                  {CARD_RARITIES.map((value) => <button type="button" key={value} aria-pressed={preferences.rarities.includes(value)} className={preferences.rarities.includes(value) ? "active" : ""} onClick={() => toggle("rarities", value)}>{preferences.rarities.includes(value) && <Check size={12} />}{value}</button>)}
                </div>
              </section>
              <section>
                <label>{es ? "Tipos" : "Types"}</label>
                <div className="settings-chips">
                  {CARD_TYPES.map((value) => <button type="button" key={value} aria-pressed={preferences.cardTypes.includes(value)} className={preferences.cardTypes.includes(value) ? "active" : ""} onClick={() => toggle("cardTypes", value)}>{preferences.cardTypes.includes(value) && <Check size={12} />}{value}</button>)}
                </div>
              </section>
            </div>
            <button type="button" className={`settings-reserved ${preferences.reservedOnly ? "active" : ""}`} aria-pressed={preferences.reservedOnly} onClick={() => update("reservedOnly", !preferences.reservedOnly)}>
              <span><Check size={14} /></span>
              <div><strong>{es ? "Solo Reserved List" : "Reserved List only"}</strong><small>{es ? "Limita las recomendaciones a cartas de oferta fija." : "Limit recommendations to fixed-supply cards."}</small></div>
            </button>
          </fieldset>

          <footer>
            <p id="preferences-onboarding-status" role="status" aria-live="polite">{message}</p>
            <button type="submit" disabled={saving}>
              {saving ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}
              {saving ? (es ? "Guardando…" : "Saving…") : (es ? "Guardar y continuar" : "Save and continue")}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

export function PreferencesOnboarding() {
  const { locale } = useLanguage();
  const es = locale === "es";
  const [account, setAccount] = useState<AccountOnboardingState | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await fetch("/api/account", { cache: "no-store" });
      if (!response.ok) throw new Error();
      const result = await response.json() as AccountOnboardingState;
      if (
        typeof result.preferencesOnboardingCompleted !== "boolean" ||
        typeof result.productTourCompleted !== "boolean" ||
        !result.preferences
      ) {
        throw new Error();
      }
      setAccount(result);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/account", { cache: "no-store", signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<AccountOnboardingState>;
      })
      .then((result) => {
        if (
          typeof result.preferencesOnboardingCompleted !== "boolean" ||
          typeof result.productTourCompleted !== "boolean" ||
          !result.preferences
        ) {
          throw new Error();
        }
        setAccount(result);
        setError(false);
      })
      .catch((requestError: unknown) => {
        if (
          !(requestError instanceof DOMException) ||
          requestError.name !== "AbortError"
        ) {
          setError(true);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const blocking = loading || error || account?.preferencesOnboardingCompleted !== true;
  useEffect(() => {
    const elements = document.querySelectorAll<HTMLElement>(
      ".preferences-gated-content, .mobile-tab-bar",
    );
    elements.forEach((element) => {
      if (blocking) element.setAttribute("inert", "");
      else element.removeAttribute("inert");
    });
    return () => elements.forEach((element) => element.removeAttribute("inert"));
  }, [blocking]);

  if (loading || error) {
    return (
      <div className="preferences-onboarding-overlay">
        <div className="preferences-onboarding-state" role={error ? "alert" : "status"} aria-live="polite">
          {error ? <RefreshCw size={24} /> : <LoaderCircle className="spin" size={24} />}
          <h1>{error ? (es ? "No pudimos cargar tu perfil." : "We couldn't load your profile.") : (es ? "Cargando tus preferencias…" : "Loading your preferences…")}</h1>
          <p>{error ? (es ? "Comprueba tu conexión e inténtalo de nuevo." : "Check your connection and try again.") : (es ? "Esto solo tardará un momento." : "This will only take a moment.")}</p>
          {error && <button type="button" onClick={() => void load()}>{es ? "Reintentar" : "Try again"}</button>}
        </div>
      </div>
    );
  }

  if (!account) return null;
  if (!account.preferencesOnboardingCompleted) {
    return <RequiredDialog account={account} onComplete={setAccount} />;
  }
  return <ProductTour initialCompleted={account.productTourCompleted} />;
}
