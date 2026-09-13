"use client";

import { createContext, ReactNode, useContext, useSyncExternalStore } from "react";

type Locale = "en" | "es";

const spanish: Record<string, string> = {
  "Overview": "Resumen",
  "Market": "Mercado",
  "News": "Noticias",
  "Opportunity Graph": "Grafo de oportunidades",
  "Inventory": "Inventario",
  "Discover": "Descubrir",
  "More": "Más",
  "Portfolio": "Cartera",
  "Watchlist": "Seguimiento",
  "Alerts": "Alertas",
  "Settings": "Ajustes",
  "Support": "Apoyar",
  "Workspace": "Espacio",
  "Account": "Cuenta",
  "Add holding": "Añadir posición",
  "Search cards, sets or artists...": "Buscar cartas, ediciones o artistas...",
  "Your collection, in focus.": "Tu colección, en perspectiva.",
  "Track market momentum and make your next move with confidence.": "Sigue el mercado y toma tu próxima decisión con confianza.",
  "Portfolio value": "Valor de cartera",
  "Total invested": "Total invertido",
  "Unrealised return": "Rentabilidad no realizada",
  "Portfolio performance": "Rendimiento de cartera",
  "Brain signal": "Señal Brain",
  "Cards making moves": "Cartas en movimiento",
  "Market pulse": "Pulso del mercado",
  "Top holdings": "Principales posiciones",
  "Your collection": "Tu colección",
  "View market": "Ver mercado",
  "See all": "Ver todo",
  "Card inventory": "Inventario de cartas",
  "Reserved List market": "Mercado Reserved List",
  "Complete market catalogue": "Catálogo completo del mercado",
  "Search all 117,000+ cards, sets, or set codes...": "Buscar entre más de 117.000 cartas, ediciones o códigos...",
  "All rarities": "Todas las rarezas",
  "Highest price": "Mayor precio",
  "Lowest price": "Menor precio",
  "Biggest 7-day gain": "Mayor subida en 7 días",
  "Card name": "Nombre",
  "Newest release": "Más recientes",
  "Filters": "Filtros",
  "Rarity": "Rareza",
  "Sort by": "Ordenar por",
  "Dashboard": "Panel",
  "Previous": "Anterior",
  "Next": "Siguiente",
  "Market price": "Precio de mercado",
  "Foil price": "Precio foil",
  "7-day movement": "Movimiento 7 días",
  "Printing": "Impresión",
  "View on Cardmarket": "Ver en Cardmarket",
  "My portfolio": "Mi cartera",
  "Brain Pro": "Brain Pro",
  "Brain tools": "Herramientas Brain",
  "Portfolio Builder": "Constructor de cartera",
  "Brain Signals": "Señales Brain",
  "Ask Brain": "Pregunta a Brain",
  "Generate portfolio": "Generar cartera",
  "Investment budget": "Presupuesto de inversión",
  "Risk profile": "Perfil de riesgo",
  "Time horizon": "Horizonte temporal",
  "Conservative": "Conservador",
  "Balanced": "Equilibrado",
  "Aggressive": "Agresivo",
  "Short term": "Corto plazo",
  "Medium term": "Medio plazo",
  "Long term": "Largo plazo",
  "Reserved List only": "Solo Reserved List",
  "Number of positions": "Número de posiciones",
  "Maximum per card": "Máximo por carta",
  "Building your portfolio…": "Creando tu cartera…",
  "Daily price history": "Historial diario de precios",
  "Reserved List": "Reserved List",
};

type LanguageContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (text: string) => string;
};

const LanguageContext = createContext<LanguageContextValue>({
  locale: "en",
  setLocale: () => undefined,
  t: (text) => text,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore<Locale>(
    (onStoreChange) => {
      window.addEventListener("magic-brain-locale", onStoreChange);
      window.addEventListener("storage", onStoreChange);
      return () => {
        window.removeEventListener("magic-brain-locale", onStoreChange);
        window.removeEventListener("storage", onStoreChange);
      };
    },
    () =>
      window.localStorage.getItem("magic-brain-locale") === "es" ? "es" : "en",
    () => "en",
  );

  const setLocale = (nextLocale: Locale) => {
    window.localStorage.setItem("magic-brain-locale", nextLocale);
    window.dispatchEvent(new Event("magic-brain-locale"));
    document.documentElement.lang = nextLocale;
    fetch("/api/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: nextLocale }),
    }).catch(() => undefined);
  };

  return (
    <LanguageContext.Provider
      value={{
        locale,
        setLocale,
        t: (text) => (locale === "es" ? spanish[text] ?? text : text),
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export const useLanguage = () => useContext(LanguageContext);

export function LanguageToggle() {
  const { locale, setLocale } = useLanguage();
  return (
    <div className="language-toggle" aria-label="Language">
      <button className={locale === "en" ? "active" : ""} onClick={() => setLocale("en")}>EN</button>
      <button className={locale === "es" ? "active" : ""} onClick={() => setLocale("es")}>ES</button>
    </div>
  );
}
