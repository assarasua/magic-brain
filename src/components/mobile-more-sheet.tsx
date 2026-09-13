"use client";

import {
  BrainCircuit,
  Compass,
  Crown,
  Heart,
  HeartHandshake,
  ListChecks,
  Settings,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { AuthControl } from "@/components/auth-control";
import { LanguageToggle, useLanguage } from "@/components/language-provider";

const groups = [
  {
    label: "Explore",
    links: [
      { href: "/discover", label: "Discover", icon: Compass, premium: true },
      { href: "/watchlist", label: "Watchlist", icon: Heart, premium: false },
      { href: "/reserved", label: "Reserved List", icon: ListChecks, premium: false },
    ],
  },
  {
    label: "Brain",
    links: [
      { href: "/brain-pro", label: "Brain Pro", icon: Crown, premium: true },
      { href: "/brain", label: "Portfolio Builder", icon: BrainCircuit, premium: true },
      { href: "/signals", label: "Brain Signals", icon: TrendingUp, premium: true },
      { href: "/analyst", label: "Ask Brain", icon: Sparkles, premium: true },
      { href: "/pro", label: "Pro plan", icon: Crown, premium: true },
    ],
  },
  {
    label: "Account",
    links: [
      { href: "/settings", label: "Settings", icon: Settings, premium: false },
      { href: "/donate", label: "Support", icon: HeartHandshake, premium: false },
    ],
  },
];

export function MobileMoreSheet({
  open,
  pathname,
  onClose,
  triggerRef,
}: {
  open: boolean;
  pathname: string;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const { locale, t } = useLanguage();
  const closeRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const trigger = triggerRef.current;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab") {
        const focusable = sheetRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
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
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      trigger?.focus();
    };
  }, [onClose, open, triggerRef]);

  if (!open) return null;

  return (
    <div className="mobile-sheet-backdrop" onMouseDown={onClose}>
      <section
        ref={sheetRef}
        className="mobile-more-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-more-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="mobile-sheet-handle" aria-hidden="true" />
        <header>
          <div>
            <span>{locale === "es" ? "Navegación" : "Navigation"}</span>
            <h2 id="mobile-more-title">{locale === "es" ? "Más" : "More"}</h2>
          </div>
          <button ref={closeRef} onClick={onClose} aria-label={locale === "es" ? "Cerrar menú" : "Close menu"}>
            <X size={20} />
          </button>
        </header>

        <div className="mobile-more-groups">
          {groups.map((group) => (
            <nav key={group.label} aria-label={group.label}>
              <span>{group.label}</span>
              {group.links.map(({ href, label, icon: Icon, premium }) => {
                const active = pathname === href || pathname.startsWith(`${href}/`);
                return (
                  <Link href={href} className={[active ? "active" : "", premium ? "premium-feature-link" : ""].filter(Boolean).join(" ")} aria-current={active ? "page" : undefined} onNavigate={onClose} key={href}>
                    <Icon size={19} />
                    <span>{t(label)}</span>
                    {premium && <small className="nav-pro-label"><Crown size={10} /> PRO</small>}
                  </Link>
                );
              })}
            </nav>
          ))}
        </div>

        <footer className="mobile-more-account">
          <LanguageToggle />
          <AuthControl />
        </footer>
      </section>
    </div>
  );
}
