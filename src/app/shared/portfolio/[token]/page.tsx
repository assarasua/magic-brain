/* eslint-disable @next/next/no-img-element */

import type { Metadata } from "next";
import { headers } from "next/headers";
import { MagicBrainLogo } from "@/components/brand-logo";
import { formatCurrency } from "@/lib/data";
import {
  consumePortfolioShareRateLimit,
  getPublicPortfolioShare,
} from "@/lib/portfolio-share";
import { isValidShareToken } from "@/lib/portfolio-share-model";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shared portfolio list · Magic Brain",
  robots: { index: false, follow: false, noarchive: true },
};

export default async function SharedPortfolioPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const requestHeaders = await headers();
  const locale = requestHeaders.get("accept-language")?.toLowerCase().startsWith("es")
    ? "es"
    : "en";
  const { token } = await params;
  const allowed = await consumePortfolioShareRateLimit(
    new Request("https://magicbrain.es/shared/portfolio", {
      headers: new Headers(requestHeaders),
    }),
  );
  const portfolio =
    allowed && isValidShareToken(token)
      ? await getPublicPortfolioShare(token)
      : null;

  if (!portfolio) {
    return (
      <main className={styles.page}>
        <MagicBrainLogo />
        <section className={styles.unavailable}>
          <h1>{locale === "es" ? "Enlace no disponible" : "Link unavailable"}</h1>
          <p>
            {locale === "es"
              ? "Este enlace no existe, ha caducado o fue revocado."
              : "This link does not exist, has expired, or was revoked."}
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header><MagicBrainLogo /><span>{locale === "es" ? "Vista pública de solo lectura" : "Public read-only view"}</span></header>
      <section className={styles.hero}>
        <span>{locale === "es" ? "Lista compartida" : "Shared list"}</span>
        <h1>{portfolio.name}</h1>
        <p>{locale === "es" ? "Precios públicos actuales. No incluye información financiera privada del propietario." : "Current public market prices. Private owner financial information is not included."}</p>
      </section>
      <section className={styles.metrics}>
        <article><span>{locale === "es" ? "Valor público actual" : "Current public value"}</span><strong>{formatCurrency(portfolio.summary.currentValue)}</strong></article>
        <article><span>{locale === "es" ? "Cartas" : "Cards"}</span><strong>{portfolio.summary.cardCount}</strong></article>
        <article><span>{locale === "es" ? "Posiciones con precio" : "Priced holdings"}</span><strong>{portfolio.summary.pricedHoldings}/{portfolio.summary.holdingCount}</strong></article>
      </section>
      <section className={styles.holdings}>
        <h2>{locale === "es" ? "Contenido de la lista" : "List contents"}</h2>
        {portfolio.holdings.map((holding, index) => (
          <article key={`${holding.setCode}-${holding.collectorNumber}-${index}`}>
            {holding.imageUrl ? <img src={holding.imageUrl} alt="" /> : <div />}
            <span><strong>{holding.name}</strong><small>{holding.setCode.toUpperCase()} · #{holding.collectorNumber} · {holding.quantity}×</small></span>
            <b>{holding.currentValue === null ? "—" : formatCurrency(holding.currentValue)}</b>
          </article>
        ))}
      </section>
      <footer>
        {locale === "es" ? "Esta vista en vivo caduca el " : "This live view expires "}
        {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(portfolio.expiresAt))}
        .
      </footer>
    </main>
  );
}
