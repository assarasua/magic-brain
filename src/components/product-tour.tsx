"use client";

import { driver, type DriveStep } from "driver.js";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { useLanguage } from "@/components/language-provider";

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
  await fetch("/api/account", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productTourCompleted: true }),
  }).catch(() => undefined);
}

export function ProductTour({ initialCompleted }: { initialCompleted?: boolean } = {}) {
  const pathname = usePathname();
  const { locale } = useLanguage();
  const launched = useRef(false);

  useEffect(() => {
    if (pathname === "/login" || launched.current || initialCompleted === true) return;
    let cancelled = false;
    let persistOnDestroy = true;
    let completionSent = false;
    let launchTimer: number | undefined;
    let tour: ReturnType<typeof driver> | undefined;

    const launch = () => {
      if (cancelled || launched.current) return;
      launched.current = true;
      const es = locale === "es";
      const steps: DriveStep[] = [
        {
          element: () => visibleTarget('[data-tour="overview"]'),
          popover: {
            title: es ? "Tu punto de partida" : "Your starting point",
            description: es ? "Aquí ves el pulso del mercado y las cartas que merecen atención hoy." : "See the market pulse and the cards worth your attention today.",
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
          element: () => visibleTarget('[data-tour="discover"]', '[data-tour="more"]'),
          popover: {
            title: es ? "Deja que Magic Brain descubra contigo" : "Let Magic Brain discover with you",
            description: es ? "Explora recomendaciones personales, señales y el resto de herramientas desde aquí." : "Explore personal recommendations, signals, and the rest of the toolkit from here.",
            side: "right",
            align: "start",
          },
        },
      ];

      tour = driver({
        steps,
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
  }, [initialCompleted, locale, pathname]);

  return null;
}
