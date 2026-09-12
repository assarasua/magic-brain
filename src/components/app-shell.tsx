"use client";

import { LoaderCircle } from "lucide-react";
import { SessionProvider, useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { MagicBrainLogo } from "@/components/brand-logo";
import { MobileTabBar } from "@/components/mobile-tab-bar";
import { ProductTour } from "@/components/product-tour";

function SessionGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { status } = useSession();
  const isLogin = pathname === "/login";

  useEffect(() => {
    if (status === "unauthenticated" && !isLogin) {
      const callbackUrl = `${window.location.pathname}${window.location.search}`;
      router.replace(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
    }
    if (status === "authenticated" && isLogin) {
      router.replace("/");
    }
  }, [isLogin, router, status]);

  if (isLogin && status !== "authenticated") return children;

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
      {children}
      <ProductTour />
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
