"use client";

import {
  ChevronDown,
  Sparkles,
  LoaderCircle,
} from "lucide-react";
import { SessionProvider, useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AuthControl } from "@/components/auth-control";
import { MagicBrainLogo } from "@/components/brand-logo";
import { useLanguage } from "@/components/language-provider";
import { ProBadge } from "@/components/magic-brain-pro";
import { MobileTabBar } from "@/components/mobile-tab-bar";
import { PreferencesOnboarding } from "@/components/preferences-onboarding";
import {
  navigationGroups,
  proNavigation,
  routeIsActive,
} from "@/components/product-navigation";
import { WebMcpNavigation } from "@/components/web-mcp-navigation";

function DesktopSidebar() {
  const pathname = usePathname();
  const { locale, t } = useLanguage();
  const brainRouteActive = proNavigation.some(({ href }) =>
    routeIsActive(pathname, href),
  );
  const [brainExpanded, setBrainExpanded] = useState(true);
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

  const showBrainNav = brainExpanded;

  return (
    <aside className="sidebar desktop-sidebar">
      <div className="sidebar-head">
        <Link href="/" aria-label="Magic Brain overview">
          <MagicBrainLogo />
        </Link>
      </div>
      <nav aria-label={locale === "es" ? "Navegación principal" : "Primary navigation"}>
        <div className={`sidebar-section-group ${showBrainNav ? "open" : ""}`}>
          <div className={`sidebar-section-header${brainRouteActive ? " active" : ""}`}>
            <span>
              <Sparkles size={14} />
              Magic Brain Pro
            </span>
            <button
              type="button"
              aria-label={
                locale === "es"
                  ? `${showBrainNav ? "Contraer" : "Expandir"} Magic Brain Pro`
                  : `${showBrainNav ? "Collapse" : "Expand"} Magic Brain Pro`
              }
              aria-expanded={showBrainNav}
              aria-controls="desktop-pro-navigation"
              onClick={() => setBrainExpanded((current) => !current)}
            >
              <ChevronDown className="sidebar-section-chevron" size={14} />
            </button>
          </div>
          {showBrainNav && (
            <div className="sidebar-subnav" id="desktop-pro-navigation">
              {proNavigation.map(({ label, href, icon: Icon }) => {
                const active = routeIsActive(pathname, href);
                return (
                  <Link
                    href={href}
                    className={`premium-feature-link${active ? " active" : ""}`}
                    aria-current={active ? "page" : undefined}
                    key={href}
                  >
                    <Icon size={15} />
                    {t(label)}
                    <ProBadge compact />
                  </Link>
                );
              })}
            </div>
          )}
        </div>
        {navigationGroups.map((group) => (
          <div className="sidebar-nav-group" key={group.label}>
            <span className="nav-caption">{t(group.label)}</span>
            {group.links.map(({ href, label, icon: Icon }) => {
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
          </div>
        ))}
      </nav>
      <div className="sidebar-bottom">
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
  const isPublic =
    pathname === "/developers" ||
    pathname.startsWith("/developers/") ||
    pathname.startsWith("/shared/portfolio/");

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
      <WebMcpNavigation />
      <SessionGate>{children}</SessionGate>
    </SessionProvider>
  );
}
