"use client";

import { LoaderCircle } from "lucide-react";
import { SessionProvider, useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { MagicBrainLogo } from "@/components/brand-logo";
import { MobileTabBar } from "@/components/mobile-tab-bar";
import { PreferencesOnboarding } from "@/components/preferences-onboarding";

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
    <>
      <div className="preferences-gated-content">{children}</div>
      <PreferencesOnboarding />
      <MobileTabBar />
    </>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <SessionGate>{children}</SessionGate>
    </SessionProvider>
  );
}
