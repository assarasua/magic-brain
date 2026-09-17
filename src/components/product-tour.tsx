"use client";

import { driver, type DriveStep } from "driver.js";
import { useEffect, useRef } from "react";
import { useLanguage } from "@/components/language-provider";

const TOUR_STORAGE_KEY = "magic-brain-product-tour-v3";

function visibleTarget(selector: string, fallback?: string) {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(selector));
  const visible = candidates.find((element) => {
    const bounds = element.getBoundingClientRect();
    return bounds.width > 0 && bounds.height > 0;
  });
  if (visible) return visible;
  if (fallback) return visibleTarget(fallback);
  return document.body;
}

async function rememberCompletion() {
  const response = await fetch("/api/account", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productTourCompleted: true }),
  }).catch(() => null);
  return response?.ok === true;
}

export function ProductTour({
  initialCompleted,
  onComplete,
}: {
  initialCompleted?: boolean;
  onComplete?: () => void;
} = {}) {
  const { locale } = useLanguage();
  const launched = useRef(false);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (launched.current || initialCompleted === true || localStorage.getItem(TOUR_STORAGE_KEY) === "complete") return;
    let cancelled = false;
    let persistOnDestroy = true;
    let completionSent = false;
    let launchTimer: number | undefined;
    let tour: ReturnType<typeof driver> | undefined;

    const launch = () => {
      if (cancelled || launched.current) return;
      launched.current = true;
      const es = locale === "es";
      const mobile = window.matchMedia("(max-width: 760px)").matches;
      const desktopSteps: DriveStep[] = [
        {
          element: () => visibleTarget('[data-tour="overview"]'),
          popover: {
            title: es ? "Empieza por el panorama general" : "Start with the big picture",
            description: es ? "El Overview resume el pulso del mercado, tus métricas y las cartas que merecen atención hoy. Úsalo como punto de partida diario." : "Overview brings together the market pulse, your metrics, and the cards worth attention today. Use it as your daily starting point.",
            side: "right",
            align: "start",
          },
        },
        {
          element: () => visibleTarget('[data-tour="inventory"]'),
          popover: {
            title: es ? "Explora todas las impresiones" : "Explore every printing",
            description: es ? "Busca por nombre, colección, rareza o color. Abre cualquier carta para consultar su edición exacta y su historial." : "Search by name, set, rarity, or colour. Open any card to inspect its exact printing and history.",
            side: "right",
            align: "start",
          },
        },
        {
          element: () => visibleTarget('[data-tour="market"]'),
          popover: {
            title: es ? "Entiende el mercado" : "Understand the market",
            description: es ? "Compara movimientos, periodos e historial antes de tomar una decisión." : "Compare movements, timeframes, and history before making a decision.",
            side: "right",
            align: "start",
          },
        },
        {
          element: () => visibleTarget('[data-tour="portfolio"]'),
          popover: {
            title: es ? "Construye tu colección" : "Build your collection",
            description: es ? "Añade cada impresión y sigue copias, coste, valor y evolución en un solo lugar." : "Add each printing and track copies, cost, value, and evolution in one place.",
            side: "right",
            align: "start",
          },
        },
        {
          element: () => visibleTarget('[data-tour="watchlist"]'),
          popover: {
            title: es ? "Separa interés de propiedad" : "Separate interest from ownership",
            description: es ? "Guarda cartas que estás siguiendo sin mezclarlas con tu colección. Así puedes observar antes de decidir." : "Save cards you are watching without mixing them into your collection, so you can observe before deciding.",
            side: "right",
            align: "start",
          },
        },
        {
          element: () => visibleTarget('[data-tour="discover"]', '[data-tour="more"]'),
          popover: {
            title: es ? "Deja que Magic Brain descubra contigo" : "Let Magic Brain discover with you",
            description: es ? "Descubre cartas según tus preferencias. Cada sugerencia explica por qué puede encajar contigo; tú mantienes siempre el control." : "Discover cards shaped by your preferences. Every suggestion explains why it may fit; you always stay in control.",
            side: "right",
            align: "start",
          },
        },
        {
          element: () => visibleTarget('[data-tour="news"]'),
          popover: {
            title: es ? "Un brief nuevo cada día" : "A fresh brief every day",
            description: es ? "Noticias convierte los movimientos de las cartas en una lectura corta con enlaces directos para seguir investigando." : "News turns card movements into a concise daily read with direct links for deeper research.",
            side: "right",
            align: "start",
          },
        },
        {
          element: () => visibleTarget('[data-tour="developers"]'),
          popover: {
            title: es ? "Construye con Magic Brain" : "Build with Magic Brain",
            description: es ? "Conecta tus propias herramientas mediante REST API, OAuth, MCP o WebMCP. La documentación y los ejemplos viven aquí." : "Connect your own tools through REST API, OAuth, MCP, or WebMCP. Documentation and examples live here.",
            side: "right",
            align: "start",
          },
        },
        {
          element: () => visibleTarget('[data-tour="referrals"]'),
          popover: {
            title: es ? "Haz crecer la comunidad" : "Grow the community",
            description: es ? "Comparte tu enlace personal, suma nuevos coleccionistas y consulta tu posición en el ranking." : "Share your personal link, bring in new collectors, and follow your leaderboard position.",
            side: "right",
            align: "start",
          },
        },
        {
          popover: {
            title: es ? "Ya tienes el mapa. Hazlo tuyo." : "You have the map. Make it yours.",
            description: es ? "Empieza añadiendo una carta a tu colección o explora el mercado. Puedes cambiar idioma, preferencias y alertas cuando quieras en Ajustes." : "Start by adding a card to your collection or exploring the market. You can change language, preferences, and alerts any time in Settings.",
          },
        },
      ];

      const mobileSteps: DriveStep[] = [
        desktopSteps[0],
        desktopSteps[2],
        desktopSteps[3],
        {
          element: () => visibleTarget('[data-tour="more"]'),
          popover: {
            title: es ? "Todo lo demás está en Más" : "Everything else lives in More",
            description: es ? "Abre Más para acceder a inventario, watchlist, Discover, noticias, developers, referidos y ajustes sin saturar la navegación." : "Open More for inventory, watchlist, Discover, news, developers, referrals, and settings without crowding navigation.",
            side: "top",
            align: "end",
          },
        },
        {
          popover: {
            title: es ? "Pensado para usar con una mano" : "Designed for one-handed use",
            description: es ? "Las acciones principales están abajo, las tarjetas se desplazan horizontalmente y los formularios evitan el zoom accidental." : "Primary actions stay at the bottom, cards swipe horizontally, and forms avoid accidental zooming.",
          },
        },
        desktopSteps.at(-1)!,
      ];

      tour = driver({
        steps: mobile ? mobileSteps : desktopSteps,
        animate: true,
        smoothScroll: true,
        allowClose: true,
        allowKeyboardControl: true,
        overlayClickBehavior: "close",
        overlayColor: "#03070d",
        overlayOpacity: 0.78,
        stagePadding: 8,
        stageRadius: 12,
        popoverClass: "magic-brain-driver",
        showProgress: true,
        progressText: es ? "Paso {{current}} de {{total}}" : "Step {{current}} of {{total}}",
        nextBtnText: es ? "Siguiente" : "Next",
        prevBtnText: es ? "Atrás" : "Back",
        doneBtnText: es ? "Empezar" : "Get started",
        onDestroyed: () => {
          if (persistOnDestroy && !completionSent) {
            completionSent = true;
            localStorage.setItem(TOUR_STORAGE_KEY, "complete");
            onCompleteRef.current?.();
            void rememberCompletion();
          }
        },
      });
      launchTimer = window.setTimeout(() => tour?.drive(), 350);
    };

    if (initialCompleted === false) {
      launch();
    } else if (initialCompleted === undefined) {
      fetch("/api/account", { cache: "no-store" })
        .then((response) => response.ok ? response.json() : null)
        .then((account: { productTourCompleted?: boolean } | null) => {
          if (account?.productTourCompleted === false) launch();
        })
        .catch(() => undefined);
    }

    return () => {
      cancelled = true;
      persistOnDestroy = false;
      if (launchTimer) window.clearTimeout(launchTimer);
      tour?.destroy();
      launched.current = false;
    };
  }, [initialCompleted, locale]);

  return null;
}
