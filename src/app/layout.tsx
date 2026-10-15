import type { Metadata } from "next";
import { Inter, Manrope } from "next/font/google";
import Script from "next/script";
import "driver.js/dist/driver.css";
import { PausedShell } from "@/components/paused-shell";
import { AppShell } from "@/components/app-shell";
import { CardDetailProvider } from "@/components/card-detail-provider";
import { LanguageProvider } from "@/components/language-provider";
import "./globals.css";
import { SITE_PAUSED } from "@/lib/site-mode";

const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
});

const manrope = Manrope({
  variable: "--font-display",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://magicbrain.es"),
  title: SITE_PAUSED ? "Magic Brain — En pausa. Volveremos." : "Magic Brain — Your Magic. Your call.",
  description:
    SITE_PAUSED ? "Magic Brain está temporalmente en pausa. Suscríbete para recibir novedades y saber cuándo volvemos." : "Explore Magic cards and prices yourself, or connect your AI agent through MCP and WebMCP for card data, Oracle text and rulings. Choose your side.",
  openGraph: {
    title: SITE_PAUSED ? "Magic Brain — En pausa. Volveremos." : "Magic Brain — Human or agentic. Choose your side.",
    description:
      SITE_PAUSED ? "La próxima jugada está por venir. Apúntate para saber cuándo volvemos." : "Your Magic. Your call. Explore the website yourself, connect an assistant through MCP, or use WebMCP in a compatible browser.",
    siteName: "Magic Brain",
    type: "website",
  },
  authors: [{ name: "Asier Sarasua", url: "https://bizkardolab.eu" }],
  creator: "Asier Sarasua",
  publisher: "BizkardoLab",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang={SITE_PAUSED ? "es" : "en"}>
      <head>
        {!SITE_PAUSED && <Script
          src="https://cdn.agentlane.com/v1/snippet.js"
          data-domain="dom-akud728upr7b"
          strategy="beforeInteractive"
        />}
      </head>
      <body className={`${inter.variable} ${manrope.variable}`}>
        <LanguageProvider syncAccount={!SITE_PAUSED} defaultLocale={SITE_PAUSED ? "es" : "en"}>
          {SITE_PAUSED ? <PausedShell>{children}</PausedShell> : <CardDetailProvider>
            <AppShell>{children}</AppShell>
          </CardDetailProvider>}
        </LanguageProvider>
      </body>
    </html>
  );
}
