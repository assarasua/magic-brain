"use client";

import {
  ArrowRight,
  Bell,
  BrainCircuit,
  ChevronDown,
  CircleDollarSign,
  Code2,
  Crown,
  Eye,
  Heart,
  LayoutDashboard,
  LibraryBig,
  MessageCircleQuestion,
  Network,
  Newspaper,
  Settings,
  Sparkles,
  Target,
  TrendingUp,
  WalletCards,
  LoaderCircle,
} from "lucide-react";
import { SessionProvider, useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AuthControl } from "@/components/auth-control";
import { MagicBrainLogo } from "@/components/brand-logo";
import { useLanguage } from "@/components/language-provider";
import { MobileTabBar } from "@/components/mobile-tab-bar";
import { PreferencesOnboarding } from "@/components/preferences-onboarding";

const workspaceNav = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/market", label: "Market", icon: TrendingUp },
  { href: "/news", label: "News", icon: Newspaper },
  { href: "/graph", label: "Opportunity Graph", icon: Network },
  { href: "/inventory", label: "Inventory", icon: LibraryBig },
  { href: "/reserved", label: "Reserved List", icon: Crown },
  { href: "/portfolio", label: "Portfolio", icon: WalletCards },
  { href: "/watchlist", label: "Watchlist", icon: Eye },
  { href: "/donate", label: "Support", icon: CircleDollarSign },
  { href: "/developers", label: "Developers", icon: Code2 },
];

const brainNav = [
  { label: "Brain Pro", href: "/brain-pro", icon: Crown },
  { label: "Predict", href: "/predict", icon: Target },
  { label: "Portfolio Builder", href: "/brain", icon: BrainCircuit },
  { label: "Brain Signals", href: "/signals", icon: TrendingUp },
  { label: "Ask Brain", href: "/analyst", icon: MessageCircleQuestion },
  { label: "Discover", href: "/discover", icon: Heart },
];

function routeIsActive(pathname: string, href: string) {
  return href === "/"
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

function DesktopSidebar() {
  const pathname = usePathname();
  const { locale, t } = useLanguage();
  const brainRouteActive = brainNav.some(({ href }) =>
    routeIsActive(pathname, href),
  );
  const [brainExpanded, setBrainExpanded] = useState(brainRouteActive);
  const [watchlistCount, setWatchlistCount] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/watchlist", { signal: controller.signal })
      .then((response) => response.json())
      .then((result: { cards?: unknown[] }) =>
        setWatchlistCount(result.cards?.length ?? 0),
      )
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const showBrainNav = brainExpanded || brainRouteActive;

  return (
    <aside className="sidebar desktop-sidebar">
      <div className="sidebar-head">
        <Link href="/" aria-label="Magic Brain overview">
          <MagicBrainLogo />
        </Link>
      </div>
      <nav aria-label={locale === "es" ? "Navegación principal" : "Primary navigation"}>
        <span className="nav-caption">{t("Workspace")}</span>
        {workspaceNav.map(({ href, label, icon: Icon }) => {
          const active = routeIsActive(pathname, href);
          return (
            <Link
              href={href}
              className={`nav-item${active ? " active" : ""}`}
              aria-current={active ? "page" : undefined}
              key={href}
            >
              <Icon size={18} />
              {t(label)}
              {label === "Watchlist" && watchlistCount !== null && (
                <span className="nav-count">{watchlistCount}</span>
              )}
            </Link>
          );
        })}
        <div className={`sidebar-section-group ${showBrainNav ? "open" : ""}`}>
          <button
            type="button"
            className={`nav-item premium-feature-link sidebar-section-trigger${brainRouteActive ? " active" : ""}`}
            aria-expanded={showBrainNav}
            onClick={() => setBrainExpanded((current) => !current)}
          >
            <Sparkles size={18} />
            Brain Pro
            <span className="nav-pro-label">
              <Crown size={10} /> {locale === "es" ? "GRATIS" : "FREE"}
            </span>
            <ChevronDown className="sidebar-section-chevron" size={14} />
          </button>
          {showBrainNav && (
            <div className="sidebar-subnav">
              {brainNav.map(({ label, href, icon: Icon }) => {
                const active = routeIsActive(pathname, href);
                return (
                  <Link
                    href={href}
                    className={active ? "active" : undefined}
                    aria-current={active ? "page" : undefined}
                    key={href}
                  >
                    <Icon size={15} />
                    {t(label)}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
        <span className="nav-caption lower">{t("Account")}</span>
        <button type="button" className="nav-item">
          <Bell size={18} />
          {t("Alerts")}
          <span className="premium-dot" />
        </button>
        <Link
          href="/settings"
          className={`nav-item${routeIsActive(pathname, "/settings") ? " active" : ""}`}
          aria-current={routeIsActive(pathname, "/settings") ? "page" : undefined}
        >
          <Settings size={18} />
          {t("Settings")}
        </Link>
      </nav>
      <div className="sidebar-bottom">
        <div className="mini-upgrade">
          <span className="crown">
            <CircleDollarSign size={16} />
          </span>
          <strong>
            {locale === "es" ? "Apoya Magic Brain" : "Support Magic Brain"}
          </strong>
          <p>
            {locale === "es"
              ? "Ayuda a mantener el proyecto abierto."
              : "Help keep the project open."}
          </p>
          <Link href="/donate">
            {locale === "es" ? "Hacer una donación" : "Make a donation"}{" "}
            <ArrowRight size={14} />
          </Link>
        </div>
        <AuthControl />
      </div>
    </aside>
  );
}

function SessionGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { status } = useSession();
  const isLogin = pathname === "/login";
  const isPublic = pathname === "/developers" || pathname.startsWith("/developers/");

  useEffect(() => {
    if (status === "unauthenticated" && !isLogin && !isPublic) {
      const callbackUrl = `${window.location.pathname}${window.location.search}`;
      router.replace(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
    }
    if (status === "authenticated" && isLogin) {
      router.replace("/");
    }
  }, [isLogin, isPublic, router, status]);

  if (isLogin && status !== "authenticated") return children;
  if (isPublic) return children;

  if (status !== "authenticated") {
    return (
      <main className="session-loading" aria-label="Checking your session">
        <MagicBrainLogo />
        <LoaderCircle className="spin" size={22} />
      </main>
    );
  }

  return (
    <div className="app-shell authenticated-app-shell">
      <DesktopSidebar />
      <div className="main-panel">{children}</div>
      <PreferencesOnboarding />
      <MobileTabBar />
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <SessionGate>{children}</SessionGate>
    </SessionProvider>
  );
}
