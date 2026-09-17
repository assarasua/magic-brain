"use client";

import {
  ChartNoAxesCombined,
  House,
  Menu,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { useLanguage } from "@/components/language-provider";
import { MobileMoreSheet } from "@/components/mobile-more-sheet";
import {
  navigationGroups,
  proNavigation,
  routeIsActive,
} from "@/components/product-navigation";

const tabs = [
  { href: "/", label: "Overview", icon: House },
  { href: "/market", label: "Market", icon: ChartNoAxesCombined },
  { href: "/portfolio", label: "Portfolio", icon: WalletCards },
];

const primaryRoutes = new Set<string>(tabs.map(({ href }) => href));
const moreRoutes = [
  ...proNavigation.map(({ href }) => href),
  ...navigationGroups.reduce<string[]>(
    (routes, { links }) => [
      ...routes,
      ...links.map(({ href }) => href),
    ],
    [],
  ),
]
  .filter((href) => !primaryRoutes.has(href));

export function MobileTabBar() {
  const pathname = usePathname();
  const { locale, t } = useLanguage();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const closeMore = useCallback(() => setMoreOpen(false), []);

  if (pathname === "/login") return null;

  return (
    <nav
      className="mobile-tab-bar"
      aria-label={locale === "es" ? "Navegación principal" : "Primary navigation"}
    >
      {tabs.map(({ href, label, icon: Icon }) => {
        const active = pathname === href;
        return (
          <Link href={href} data-tour={href === "/" ? "overview" : href.slice(1)} className={active ? "active" : undefined} aria-current={active ? "page" : undefined} key={href}>
            <Icon size={20} strokeWidth={active ? 2.3 : 1.8} />
            <span>{t(label)}</span>
          </Link>
        );
      })}
      <button
        ref={moreButtonRef}
        type="button"
        data-tour="more"
        className={moreOpen || moreRoutes.some((route) => routeIsActive(pathname, route)) ? "active" : ""}
        aria-haspopup="dialog"
        aria-expanded={moreOpen}
        onClick={() => setMoreOpen((current) => !current)}
      >
        <Menu size={20} strokeWidth={moreOpen ? 2.3 : 1.8} />
        <span>{t("More")}</span>
      </button>
      <MobileMoreSheet
        open={moreOpen}
        pathname={pathname}
        onClose={closeMore}
        triggerRef={moreButtonRef}
      />
    </nav>
  );
}
