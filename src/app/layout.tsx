import type { Metadata } from "next";
import { Inter, Manrope } from "next/font/google";
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
  title: "Magic Brain AI Pro — Invest smarter in Magic",
  description:
    "Track card prices, follow market signals and manage your Magic: The Gathering portfolio.",
  authors: [{ name: "Asier Sarasua", url: "https://bizkardolab.com" }],
  creator: "Asier Sarasua",
  publisher: "BizkardoLab",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
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
