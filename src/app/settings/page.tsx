"use client";

import {
  ArrowLeft,
  Check,
  LoaderCircle,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AuthControl } from "@/components/auth-control";
import { MagicBrainLogo } from "@/components/brand-logo";
import { LanguageToggle, useLanguage } from "@/components/language-provider";
import { SetSelector } from "@/components/set-selector";
import { CARD_COLORS, CARD_RARITIES, CARD_TYPES } from "@/lib/card-filters";
import {
  defaultUserPreferences,
  type UserPreferences,
} from "@/lib/user-preferences";

type AccountSettings = {
  name: string | null;
  email: string | null;
  preferences: UserPreferences;
};

const riskLevels: UserPreferences["risk"][] = [
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

export default function SettingsPage() {
  const { locale, t } = useLanguage();
  const es = locale === "es";
  const [account, setAccount] = useState<AccountSettings | null>(null);
  const [preferences, setPreferences] = useState(defaultUserPreferences);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    fetch("/api/account")
      .then((response) => response.json())
      .then((result: AccountSettings) => {
        setAccount(result);
        setPreferences(result.preferences ?? defaultUserPreferences);
      })
      .catch(() => undefined);
  }, []);

  const update = <K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K],
  ) => setPreferences((current) => ({ ...current, [key]: value }));

  const toggle = (
    key: "colors" | "rarities" | "cardTypes" | "setCodes",
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

  const save = async () => {
    setSaving(true);
    setNotice("");
    const response = await fetch("/api/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferences }),
    });
    setSaving(false);
    setNotice(
      response.ok
        ? es ? "Preferencias guardadas en tu cuenta." : "Preferences saved to your account."
        : es ? "No se pudieron guardar los cambios." : "Unable to save your changes.",
    );
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
    <main className="account-page settings-page">
      <header className="account-topbar">
        <Link href="/" className="inventory-brand"><MagicBrainLogo /></Link>
        <nav><Link href="/portfolio">{t("Portfolio")}</Link><Link href="/watchlist">{t("Watchlist")}</Link><Link href="/brain-pro">Brain Pro</Link></nav>
        <LanguageToggle />
        <AuthControl compact />
        <Link href="/" className="back-dashboard"><ArrowLeft size={15} /> {t("Dashboard")}</Link>
      </header>

      <div className="settings-content">
        <div className="settings-heading">
          <div>
            <span className="eyebrow">{es ? "PERSONALIZACIÓN" : "PERSONALISATION"}</span>
            <h1>{es ? "Tus preferencias de inversión." : "Your investment preferences."}</h1>
            <p>{es ? "Guarda tus criterios una vez. Brain los utilizará como punto de partida en cada nueva estrategia." : "Save your criteria once. Brain will use them as the starting point for every new strategy."}</p>
          </div>
          <button onClick={save} disabled={saving || !account}>
            {saving ? <LoaderCircle className="spin" size={17} /> : <Save size={17} />}
            {saving ? (es ? "Guardando…" : "Saving…") : es ? "Guardar cambios" : "Save changes"}
          </button>
        </div>

        <section className="settings-profile-card">
          <span><UserRound size={19} /></span>
          <div><strong>{account?.name ?? (es ? "Inversor de Magic Brain" : "Magic Brain investor")}</strong><small>{account?.email ?? (es ? "Perfil guardado en este dispositivo" : "Profile saved on this device")}</small></div>
          <em>{es ? "Acceso gratuito" : "Free access"}</em>
        </section>

        <div className="settings-grid">
          <section className="settings-panel">
            <div className="settings-section-title"><span><ShieldCheck size={19} /></span><div><h2>{es ? "Perfil inversor" : "Investor profile"}</h2><p>{es ? "Controla cuánto riesgo puede asumir Brain." : "Control how much risk Brain can take."}</p></div></div>
            <label>{es ? "Nivel de riesgo" : "Risk level"}</label>
            <div className="preference-choice five">
              {riskLevels.map((value, index) => <button key={value} className={preferences.risk === value ? "active" : ""} onClick={() => update("risk", value)}><span>{["○", "◔", "◑", "◕", "●"][index]}</span><strong>{riskLabel(value)}</strong></button>)}
            </div>

            <label>{es ? "Horizonte temporal" : "Time horizon"}</label>
            <div className="preference-choice three">
              {(["short", "medium", "long"] as const).map((value) => <button key={value} className={preferences.horizon === value ? "active" : ""} onClick={() => update("horizon", value)}><strong>{es ? { short: "Corto", medium: "Medio", long: "Largo" }[value] : `${value[0].toUpperCase()}${value.slice(1)}`}</strong><small>{value === "short" ? "< 6m" : value === "medium" ? "6–18m" : "18m+"}</small></button>)}
            </div>

            <label>{es ? "Enfoque preferido" : "Preferred approach"}</label>
            <div className="preference-choice two">
              {strategies.map((value) => <button key={value} className={preferences.strategy === value ? "active" : ""} onClick={() => update("strategy", value)}><strong>{strategyLabel(value)}</strong></button>)}
            </div>
          </section>

          <section className="settings-panel">
            <div className="settings-section-title"><span><SlidersHorizontal size={19} /></span><div><h2>{es ? "Límites predeterminados" : "Default boundaries"}</h2><p>{es ? "Estos valores aparecerán precargados en Brain." : "These values will be prefilled in Brain."}</p></div></div>
            <div className="settings-number-grid">
              <label>{es ? "Presupuesto" : "Budget"}<div><span>€</span><input type="number" min="25" max="1000000" value={preferences.defaultBudget} onChange={(event) => update("defaultBudget", Number(event.target.value))} /></div></label>
              <label>{es ? "Máximo por carta" : "Maximum per card"}<div><span>€</span><input type="number" min="2" max="1000000" value={preferences.maxCardPrice} onChange={(event) => update("maxCardPrice", Number(event.target.value))} /></div></label>
              <label>{es ? "Número de posiciones" : "Number of positions"}<input type="number" min="3" max="20" value={preferences.positions} onChange={(event) => update("positions", Number(event.target.value))} /></label>
            </div>

            <label>{es ? "Tendencia objetivo" : "Target trend"}</label>
            <select value={preferences.marketTrend} onChange={(event) => update("marketTrend", event.target.value as UserPreferences["marketTrend"])}>
              <option value="any">{es ? "Cualquier tendencia" : "Any trend"}</option>
              <option value="rising">{es ? "Subida confirmada" : "Confirmed growth"}</option>
              <option value="stable">{es ? "Precio estable" : "Stable pricing"}</option>
              <option value="recovering">{es ? "En recuperación" : "Recovering"}</option>
            </select>

            <label>{es ? "Época de edición" : "Release era"}</label>
            <select value={preferences.releaseEra} onChange={(event) => update("releaseEra", event.target.value as UserPreferences["releaseEra"])}>
              <option value="any">{es ? "Todas las épocas" : "All eras"}</option>
              <option value="classic">{es ? "Clásica · antes de 2004" : "Classic · before 2004"}</option>
              <option value="established">{es ? "Consolidada · 2004–2018" : "Established · 2004–2018"}</option>
              <option value="recent">{es ? "Reciente · 2019+" : "Recent · 2019+"}</option>
            </select>
          </section>

          <section className="settings-panel wide">
            <div className="settings-section-title"><span><Sparkles size={19} /></span><div><h2>{es ? "Universo de cartas" : "Card universe"}</h2><p>{es ? "Prioriza los segmentos que conoces mejor. Deja todo vacío para no limitar resultados." : "Prioritise the segments you know best. Leave selections empty for unrestricted results."}</p></div></div>
            <div className="settings-options-row">
              <div><label>{es ? "Colores" : "Colours"}</label><div className="settings-colours">{colours.map((colour) => <button key={colour.value} title={colour.label} className={preferences.colors.includes(colour.value) ? "active" : ""} onClick={() => toggle("colors", colour.value)}>{colour.symbol}</button>)}</div></div>
              <div><label>{es ? "Rarezas" : "Rarities"}</label><div className="settings-chips">{CARD_RARITIES.map((value) => <button key={value} className={preferences.rarities.includes(value) ? "active" : ""} onClick={() => toggle("rarities", value)}>{preferences.rarities.includes(value) && <Check size={12} />}{value}</button>)}</div></div>
            </div>
            <label>{es ? "Tipos de carta" : "Card types"}</label>
            <div className="settings-chips">{CARD_TYPES.map((value) => <button key={value} className={preferences.cardTypes.includes(value) ? "active" : ""} onClick={() => toggle("cardTypes", value)}>{preferences.cardTypes.includes(value) && <Check size={12} />}{value}</button>)}</div>
            <SetSelector
              value={preferences.setCodes}
              onChange={(codes) => update("setCodes", codes)}
              multiple
              label={es ? "Limitar a ediciones" : "Limit to sets"}
              allLabel={es ? "Todas las ediciones" : "All sets"}
            />
            <button className={`settings-reserved ${preferences.reservedOnly ? "active" : ""}`} onClick={() => update("reservedOnly", !preferences.reservedOnly)}><span><Check size={14} /></span><div><strong>{es ? "Priorizar exclusivamente Reserved List" : "Reserved List only"}</strong><small>{es ? "Limita las estrategias a cartas de oferta fija." : "Limit strategies to fixed-supply cards."}</small></div></button>
          </section>

        </div>

        <div className="settings-save-bar">
          <span>{notice || (es ? "Tus preferencias se guardan en Railway y se sincronizan con tu cuenta." : "Preferences are stored in Railway and synced with your account.")}</span>
          <button onClick={save} disabled={saving || !account}><Save size={15} /> {es ? "Guardar preferencias" : "Save preferences"}</button>
        </div>
      </div>
    </main>
  );
}
