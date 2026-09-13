"use client";

/* eslint-disable @next/next/no-img-element */

import { LogOut, UserRound } from "lucide-react";
import { signIn, signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import { useLanguage } from "@/components/language-provider";

type Account = {
  authenticated: boolean;
  googleAuthConfigured: boolean;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
};

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.6 12.2c0-.7-.1-1.5-.2-2.2H12v4.3h6a5.2 5.2 0 0 1-2.2 3.3v2.8h3.6c2.1-2 3.2-4.8 3.2-8.2Z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.4-2.7l-3.6-2.8c-1 .7-2.3 1.1-3.8 1.1-2.9 0-5.3-2-6.2-4.6H2.1v2.9A11.2 11.2 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.8 14a6.7 6.7 0 0 1 0-4.1V7H2.1a11.2 11.2 0 0 0 0 9.9L5.8 14Z" />
      <path fill="#EA4335" d="M12 5.3c1.7 0 3.1.6 4.3 1.7l3.2-3.2A10.8 10.8 0 0 0 2.1 7l3.7 2.9c.9-2.7 3.3-4.6 6.2-4.6Z" />
    </svg>
  );
}

export function AuthControl({
  compact = false,
}: {
  compact?: boolean;
}) {
  const { locale } = useLanguage();
  const [account, setAccount] = useState<Account | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/account")
      .then((response) => response.json())
      .then((result: Account) => setAccount(result))
      .catch(() => undefined);
  }, []);

  const login = () => {
    if (!account?.googleAuthConfigured) return;
    void signIn("google", { redirectTo: window.location.href });
  };

  const logout = async () => {
    await fetch("/api/account/logout", { method: "POST" });
    await signOut({ redirectTo: "/" });
  };

  if (!account) {
    return <div className={compact ? "auth-skeleton compact" : "auth-skeleton"} />;
  }

  if (!account.authenticated) {
    return (
      <button
        className={compact ? "google-login compact" : "google-login"}
        onClick={login}
        disabled={!account.googleAuthConfigured}
        title={
          account.googleAuthConfigured
            ? undefined
            : locale === "es"
              ? "Añade las credenciales OAuth de Google"
              : "Add Google OAuth credentials"
        }
      >
        <GoogleMark />
        {!compact && (
          <span>
            {account.googleAuthConfigured
              ? locale === "es"
                ? "Continuar con Google"
                : "Continue with Google"
              : locale === "es"
                ? "Google pendiente"
                : "Google setup needed"}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className={compact ? "auth-account compact" : "auth-account"}>
      <button onClick={() => setOpen((current) => !current)} aria-expanded={open}>
        {account.avatarUrl ? (
          <img src={account.avatarUrl} alt="" referrerPolicy="no-referrer" />
        ) : (
          <span className="auth-avatar"><UserRound size={16} /></span>
        )}
        {!compact && (
          <span className="auth-identity">
            <strong>{account.name ?? account.email}</strong>
            <small>{account.email}</small>
          </span>
        )}
      </button>
      {open && (
        <div className="auth-menu">
          <span>{account.email}</span>
          <button onClick={logout}>
            <LogOut size={15} />
            {locale === "es" ? "Cerrar sesión" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}
