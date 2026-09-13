"use client";

import {
  ChartNoAxesCombined,
  BrainCircuit,
  House,
  Menu,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { useLanguage } from "@/components/language-provider";
import { MobileMoreSheet } from "@/components/mobile-more-sheet";

const tabs = [
  { href: "/", label: "Overview", icon: House },
  { href: "/market", label: "Market", icon: ChartNoAxesCombined },
  { href: "/portfolio", label: "Portfolio", icon: WalletCards },
  { href: "/brain-pro", label: "Brain Pro", icon: BrainCircuit, premium: true },
];

const moreRoutes = ["/inventory", "/discover", "/watchlist", "/reserved", "/brain", "/signals", "/analyst", "/pro", "/settings", "/donate", "/developers"];

export function MobileTabBar() {
  const pathname = usePathname();
  const { t } = useLanguage();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const closeMore = useCallback(() => setMoreOpen(false), []);

  if (pathname === "/login") return null;

  return (
    <nav className="mobile-tab-bar" aria-label="Primary navigation">
      {tabs.map(({ href, label, icon: Icon, premium = false }) => {
        const active =
          href === "/"
            ? pathname === "/"
            : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link href={href} className={[active ? "active" : "", premium ? "premium" : ""].filter(Boolean).join(" ")} aria-current={active ? "page" : undefined} key={href}>
            <Icon size={20} strokeWidth={active ? 2.3 : 1.8} />
            <span>{t(label)}</span>
          </Link>
        );
      })}
      <button
        ref={moreButtonRef}
        type="button"
        className={moreOpen || moreRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`)) ? "active" : ""}
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
