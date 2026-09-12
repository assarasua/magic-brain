"use client";

import {
  ChartNoAxesCombined,
  Heart,
  House,
  LibraryBig,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/components/language-provider";

const tabs = [
  { href: "/", label: "Overview", icon: House },
  { href: "/market", label: "Market", icon: ChartNoAxesCombined },
  { href: "/inventory", label: "Inventory", icon: LibraryBig },
  { href: "/portfolio", label: "Portfolio", icon: WalletCards },
  { href: "/discover", label: "Discover", icon: Heart },
];

export function MobileTabBar() {
  const pathname = usePathname();
  const { t } = useLanguage();

  if (pathname === "/login") return null;

  return (
    <nav className="mobile-tab-bar" aria-label="Primary navigation">
      {tabs.map(({ href, label, icon: Icon }) => {
        const active =
          href === "/"
            ? pathname === "/"
            : pathname === href ||
              (href === "/inventory" && pathname === "/reserved");
        return (
          <Link href={href} className={active ? "active" : ""} key={href}>
            <Icon size={20} strokeWidth={active ? 2.3 : 1.8} />
            <span>{t(label)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
