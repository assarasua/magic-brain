"use client";

import { Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AuthControl } from "@/components/auth-control";
import { LanguageToggle, useLanguage } from "@/components/language-provider";
import { ProBadge } from "@/components/magic-brain-pro";
import {
  navigationGroups,
  proNavigation,
  routeIsActive,
} from "@/components/product-navigation";

const fixedMobileRoutes = new Set(["/", "/market", "/portfolio"]);

const groups = [
  {
    label: "Magic Brain Pro",
    links: proNavigation,
    pro: true,
  },
  ...navigationGroups.map((group) => ({
    ...group,
    links: group.links.filter(({ href }) => !fixedMobileRoutes.has(href)),
    pro: false,
  })),
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

  return createPortal(
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
            <nav
              className={group.pro ? "mobile-pro-group" : undefined}
              key={group.label}
              aria-label={t(group.label)}
            >
              <span>
                {group.pro && <Sparkles size={13} />}
                {t(group.label)}
              </span>
              {group.links.map((link) => {
                const { href, label, icon: Icon } = link;
                const active = routeIsActive(pathname, href);
                return (
                  <Link href={href} className={[active ? "active" : "", group.pro ? "premium-feature-link" : ""].filter(Boolean).join(" ")} aria-current={active ? "page" : undefined} onNavigate={onClose} key={href}>
                    <Icon size={19} />
                    <span>{t(label)}</span>
                    {group.pro && <ProBadge compact />}
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
    </div>,
    document.body,
  );
}
