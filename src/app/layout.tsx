import type { Metadata } from "next";
import { Inter, Manrope } from "next/font/google";
import Script from "next/script";
import "driver.js/dist/driver.css";
import { AppShell } from "@/components/app-shell";
import { CardDetailProvider } from "@/components/card-detail-provider";
import { LanguageProvider } from "@/components/language-provider";
import "./globals.css";

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
  title: "Magic Brain — Know and enjoy your Magic collection",
  description:
    "Organize your Magic: The Gathering collection, explore cards and editions, and understand value with clear market context.",
  authors: [{ name: "Asier Sarasua", url: "https://bizkardolab.eu" }],
  creator: "Asier Sarasua",
  publisher: "BizkardoLab",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <Script
          src="https://cdn.agentlane.com/v1/snippet.js"
          data-domain="dom-akud728upr7b"
          strategy="beforeInteractive"
        />
      </head>
      <body className={`${inter.variable} ${manrope.variable}`}>
        <LanguageProvider>
          <CardDetailProvider>
            <AppShell>{children}</AppShell>
          </CardDetailProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
