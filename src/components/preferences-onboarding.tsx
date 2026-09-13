"use client";

import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BrainCircuit,
  Check,
  ChevronDown,
  Eye,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  WalletCards,
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
const onboardingStepCount = 6;
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
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    titleRef.current?.focus();
  }, [step]);

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

  const save = async () => {
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
        body: JSON.stringify({
          preferences: validPreferences,
          productTourCompleted: true,
        }),
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
        productTourCompleted: result.productTourCompleted === true,
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
  const horizonLabel = (value: UserPreferences["horizon"]) =>
    es
      ? { short: "Corto", medium: "Medio", long: "Largo" }[value]
      : { short: "Short", medium: "Medium", long: "Long" }[value];

  const stepCopy = es
    ? [
        {
          eyebrow: "BIENVENIDO A MAGIC BRAIN",
          title: "Invierte con contexto, no con intuición.",
          description:
            "Primero te enseñamos cómo funciona el producto. Después crearemos un perfil para adaptar cada señal, predicción y cartera a ti.",
        },
        {
          eyebrow: "PASO 1 · PERFIL",
          title: "¿Qué nivel de riesgo encaja contigo?",
          description:
            "Esto determina cuánto peso damos a estabilidad, volatilidad y potencial de crecimiento.",
        },
        {
          eyebrow: "PASO 2 · OBJETIVO",
          title: "Define cómo quieres invertir.",
          description:
            "El horizonte y la estrategia cambian qué oportunidades prioriza Magic Brain.",
        },
        {
          eyebrow: "PASO 3 · PRESUPUESTO",
          title: "Pon límites antes de buscar oportunidades.",
          description:
            "Usaremos estos números para construir carteras realistas y evitar posiciones desproporcionadas.",
        },
        {
          eyebrow: "PASO 4 · MERCADO",
          title: "Afina el universo de cartas.",
          description:
            "Estos filtros son opcionales. Déjalos abiertos si quieres que Brain explore todo el mercado.",
        },
        {
          eyebrow: "PASO 5 · REVISIÓN",
          title: "Tu perfil está listo.",
          description:
            "Magic Brain utilizará estas preferencias en Predict, Discover, Brain Pro y las carteras automáticas.",
        },
      ]
    : [
        {
          eyebrow: "WELCOME TO MAGIC BRAIN",
          title: "Invest with context, not instinct.",
          description:
            "First, see how the product works. Then we will build a profile that adapts every signal, prediction, and portfolio to you.",
        },
        {
          eyebrow: "STEP 1 · PROFILE",
          title: "How much risk feels right?",
          description:
            "This determines how much weight we give stability, volatility, and growth potential.",
        },
        {
          eyebrow: "STEP 2 · GOAL",
          title: "Define how you want to invest.",
          description:
            "Your horizon and strategy change which opportunities Magic Brain prioritises.",
        },
        {
          eyebrow: "STEP 3 · BUDGET",
          title: "Set limits before finding opportunities.",
          description:
            "We use these numbers to build realistic portfolios and avoid oversized positions.",
        },
        {
          eyebrow: "STEP 4 · MARKET",
          title: "Refine your card universe.",
          description:
            "These filters are optional. Leave them open if you want Brain to explore the entire market.",
        },
        {
          eyebrow: "STEP 5 · REVIEW",
          title: "Your profile is ready.",
          description:
            "Magic Brain will use these preferences across Predict, Discover, Brain Pro, and automatic portfolios.",
        },
      ];
  const currentCopy = stepCopy[step];
  const isLastStep = step === onboardingStepCount - 1;

  const validateBudget = () => {
    if (
      preferences.defaultBudget < 25 ||
      preferences.maxCardPrice < 2 ||
      preferences.maxCardPrice > preferences.defaultBudget ||
      preferences.positions < 3 ||
      preferences.positions > 20
    ) {
      setMessage(
        es
          ? "Revisa los límites. El máximo por carta no puede superar el presupuesto."
          : "Check the limits. Maximum card price cannot exceed the budget.",
      );
      return false;
    }
    return true;
  };

  const next = () => {
    if (step === 3 && !validateBudget()) return;
    setMessage("");
    setStep((current) => Math.min(current + 1, onboardingStepCount - 1));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (isLastStep) void save();
    else next();
  };

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
        <div className="preferences-onboarding-progress" aria-label={`${step + 1} / ${onboardingStepCount}`}>
          <span>{es ? "Tu configuración" : "Your setup"}</span>
          <div>
            {Array.from({ length: onboardingStepCount }, (_, index) => (
              <i key={index} className={index <= step ? "active" : ""} />
            ))}
          </div>
          <strong>{step + 1}/{onboardingStepCount}</strong>
        </div>
        <header>
          <span><Sparkles size={19} /></span>
          <div>
            <small>{currentCopy.eyebrow}</small>
            <h1 id="preferences-onboarding-title" ref={titleRef} tabIndex={-1}>
              {currentCopy.title}
            </h1>
            <p id="preferences-onboarding-description">
              {currentCopy.description}
            </p>
          </div>
        </header>

        <form onSubmit={submit}>
          <div className="preferences-onboarding-step">
            {step === 0 && (
              <div className="onboarding-product-intro">
                <article>
                  <span><BarChart3 size={20} /></span>
                  <div>
                    <strong>{es ? "Entiende el mercado" : "Understand the market"}</strong>
                    <p>{es ? "Compara movimientos, historial diario y riesgo antes de decidir." : "Compare movement, daily history, and risk before deciding."}</p>
                  </div>
                </article>
                <article>
                  <span><BrainCircuit size={20} /></span>
                  <div>
                    <strong>{es ? "Encuentra oportunidades" : "Find opportunities"}</strong>
                    <p>{es ? "Brain conecta señales, predicciones y cartas similares con tu perfil." : "Brain connects signals, predictions, and similar cards to your profile."}</p>
                  </div>
                </article>
                <article>
                  <span><WalletCards size={20} /></span>
                  <div>
                    <strong>{es ? "Construye y controla" : "Build and monitor"}</strong>
                    <p>{es ? "Crea carteras manuales o automáticas y mide rentabilidad y concentración." : "Create manual or automatic portfolios and track return and concentration."}</p>
                  </div>
                </article>
                <p className="onboarding-product-note">
                  <Eye size={15} />
                  {es
                    ? "Tus preferencias se guardan en tu cuenta y puedes cambiarlas en Ajustes."
                    : "Your preferences are saved to your account and can be changed in Settings."}
                </p>
              </div>
            )}

            {step === 1 && (
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
            </fieldset>
            )}

            {step === 2 && (
            <fieldset>
              <legend><Sparkles size={16} /> {es ? "Objetivo de inversión" : "Investment goal"}</legend>
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
                    <strong>{horizonLabel(value)}</strong>
                    <small>{value === "short" ? "< 6m" : value === "medium" ? "6–18m" : "18m+"}</small>
                  </button>
                ))}
              </div>
              <label>{es ? "Estrategia principal" : "Primary strategy"}</label>
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
            )}

            {step === 3 && (
            <fieldset>
              <legend><SlidersHorizontal size={16} /> {es ? "Límites de cartera" : "Portfolio limits"}</legend>
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
              <p className="onboarding-field-help">
                {es
                  ? "Estos valores son el punto de partida de Predict y del generador automático. Nunca ejecutamos compras."
                  : "These values seed Predict and the automatic builder. Magic Brain never executes purchases."}
              </p>
            </fieldset>
            )}

            {step === 4 && (
            <fieldset className="onboarding-card-options">
              <legend><Sparkles size={16} /> {es ? "Preferencias de mercado" : "Market preferences"}</legend>
              <div className="onboarding-market-selects">
                <section>
                  <label htmlFor="onboarding-market-trend">{es ? "Tendencia objetivo" : "Target market trend"}</label>
                  <div className="onboarding-select">
                    <select id="onboarding-market-trend" value={preferences.marketTrend} onChange={(event) => update("marketTrend", event.target.value as UserPreferences["marketTrend"])}>
                      <option value="any">{es ? "Cualquier tendencia" : "Any trend"}</option>
                      <option value="rising">{es ? "Subida confirmada" : "Confirmed growth"}</option>
                      <option value="stable">{es ? "Precio estable" : "Stable pricing"}</option>
                      <option value="recovering">{es ? "En recuperación" : "Recovering"}</option>
                    </select>
                    <ChevronDown size={16} aria-hidden="true" />
                  </div>
                </section>
                <section>
                  <label htmlFor="onboarding-release-era">{es ? "Época de edición" : "Release era"}</label>
                  <div className="onboarding-select">
                    <select id="onboarding-release-era" value={preferences.releaseEra} onChange={(event) => update("releaseEra", event.target.value as UserPreferences["releaseEra"])}>
                      <option value="any">{es ? "Todas las épocas" : "All eras"}</option>
                      <option value="classic">{es ? "Clásica · antes de 2004" : "Classic · before 2004"}</option>
                      <option value="established">{es ? "Consolidada · 2004–2018" : "Established · 2004–2018"}</option>
                      <option value="recent">{es ? "Reciente · 2019+" : "Recent · 2019+"}</option>
                    </select>
                    <ChevronDown size={16} aria-hidden="true" />
                  </div>
                </section>
              </div>
              <div className="onboarding-card-preferences">
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
            )}

            {step === 5 && (
              <div className="onboarding-review">
                <div><small>{es ? "RIESGO" : "RISK"}</small><strong>{riskLabel(preferences.risk)}</strong></div>
                <div><small>{es ? "HORIZONTE" : "HORIZON"}</small><strong>{horizonLabel(preferences.horizon)}</strong></div>
                <div><small>{es ? "ESTRATEGIA" : "STRATEGY"}</small><strong>{strategyLabel(preferences.strategy)}</strong></div>
                <div><small>{es ? "PRESUPUESTO" : "BUDGET"}</small><strong>€{preferences.defaultBudget.toLocaleString()}</strong></div>
                <div><small>{es ? "MÁXIMO / CARTA" : "MAX / CARD"}</small><strong>€{preferences.maxCardPrice.toLocaleString()}</strong></div>
                <div><small>{es ? "POSICIONES" : "POSITIONS"}</small><strong>{preferences.positions}</strong></div>
                <p>
                  <Check size={16} />
                  {es
                    ? "Podrás modificar cualquier elección desde Ajustes."
                    : "You can change every choice later from Settings."}
                </p>
              </div>
            )}
          </div>

          <footer>
            <p id="preferences-onboarding-status" role="status" aria-live="polite">{message}</p>
            <div className="preferences-onboarding-actions">
              {step > 0 && (
                <button type="button" className="secondary" onClick={() => { setMessage(""); setStep((current) => current - 1); }} disabled={saving}>
                  <ArrowLeft size={16} /> {es ? "Atrás" : "Back"}
                </button>
              )}
              <button type="submit" disabled={saving}>
                {saving ? <LoaderCircle className="spin" size={17} /> : isLastStep ? <Check size={17} /> : <ArrowRight size={17} />}
                {saving
                  ? (es ? "Guardando…" : "Saving…")
                  : isLastStep
                    ? (es ? "Guardar y entrar" : "Save and enter")
                    : step === 0
                      ? (es ? "Crear mi perfil" : "Build my profile")
                      : (es ? "Continuar" : "Continue")}
              </button>
            </div>
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
      ".authenticated-app-shell > .desktop-sidebar, .authenticated-app-shell > .main-panel, .authenticated-app-shell > .mobile-tab-bar",
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
