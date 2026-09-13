"use client";

/* eslint-disable @next/next/no-img-element */

import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { LanguageToggle, useLanguage } from "@/components/language-provider";
import { AuthControl } from "@/components/auth-control";
import { MagicBrainLogo } from "@/components/brand-logo";
import { useCardDetail } from "@/components/card-detail-provider";
import type { CatalogCard } from "@/lib/catalog";
import { formatCurrency } from "@/lib/data";

function MoverList({
  cards,
  direction,
  days,
}: {
  cards: CatalogCard[];
  direction: "up" | "down";
  days: number;
}) {
  const { cardSurfaceProps } = useCardDetail();
  return (
    <div className="market-list">
      {cards.map((card, index) => (
        <div className="market-card-link card-surface" key={card.id} {...cardSurfaceProps(card)}>
          <span className="market-rank">{String(index + 1).padStart(2, "0")}</span>
          {card.imageUrl && <img src={card.imageUrl} alt="" />}
          <div><strong>{card.name}</strong><span>{card.setCode.toUpperCase()} · {card.setName}</span></div>
          <div><strong>{card.price === null ? "—" : formatCurrency(card.price)}</strong><em className={direction === "up" ? "up" : "down"}>{direction === "up" ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{card.change7d === null ? "—" : `${Math.abs(card.change7d).toFixed(1)}%`} <small>{days}D</small></em></div>
          <ArrowRight size={14} />
        </div>
      ))}
    </div>
  );
}

export default function MarketPage() {
  const { locale, t } = useLanguage();
  const [days, setDays] = useState(7);
  const [gainers, setGainers] = useState<CatalogCard[]>([]);
  const [losers, setLosers] = useState<CatalogCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch(`/api/market/movers?direction=gainers&days=${days}`, { signal: controller.signal }).then((response) => {
        if (!response.ok) throw new Error("Unable to load gainers");
        return response.json() as Promise<{ cards: CatalogCard[] }>;
      }),
      fetch(`/api/market/movers?direction=losers&days=${days}`, { signal: controller.signal }).then((response) => {
        if (!response.ok) throw new Error("Unable to load losers");
        return response.json() as Promise<{ cards: CatalogCard[] }>;
      }),
    ])
      .then(([up, down]) => {
        setGainers(up.cards);
        setLosers(down.cards);
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") {
          setGainers([]);
          setLosers([]);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [days]);

  return (
    <main className="account-page">
      <header className="account-topbar">
        <Link href="/" className="inventory-brand"><MagicBrainLogo /></Link>
        <nav><Link href="/inventory">{t("Inventory")}</Link><Link href="/reserved">{t("Reserved List")}</Link><Link href="/brain">Brain Pro</Link></nav>
        <LanguageToggle />
        <AuthControl compact />
        <Link href="/" className="back-dashboard"><ArrowLeft size={15} /> {t("Dashboard")}</Link>
      </header>
      <div className="account-content market-page-content">
        <div className="account-heading">
          <div><span className="eyebrow">{locale === "es" ? "Inteligencia diaria" : "Daily intelligence"}</span><h1>{locale === "es" ? "Pulso del mercado" : "Market pulse"}</h1><p>{locale === "es" ? "Movimientos de precio calculados con tu histórico real." : "Price movement calculated from your live historical dataset."}</p></div>
          <div className="market-period" aria-label={locale === "es" ? "Periodo de mercado" : "Market period"}>{[1, 7, 30].map((value) => <button className={days === value ? "active" : ""} aria-pressed={days === value} key={value} onClick={() => { if (days !== value) { setLoading(true); setDays(value); } }}>{value}D</button>)}</div>
        </div>
        <section className="market-summary" aria-live="polite" aria-busy={loading}>
          <div className="fintech-panel"><span>{locale === "es" ? "Universo analizado" : "Analysed universe"}</span><strong>117,923</strong><small>{locale === "es" ? "impresiones" : "printings"}</small></div>
          <div className="fintech-panel"><TrendingUp size={18} /><span>{locale === "es" ? `Mayor subida · ${days}D` : `Top gain · ${days}D`}</span><strong className="up">{gainers[0]?.change7d != null ? `+${gainers[0].change7d.toFixed(1)}%` : "—"}</strong></div>
          <div className="fintech-panel"><TrendingDown size={18} /><span>{locale === "es" ? `Mayor bajada · ${days}D` : `Top decline · ${days}D`}</span><strong className="down">{losers[0]?.change7d != null ? `${losers[0].change7d.toFixed(1)}%` : "—"}</strong></div>
          <Link className="fintech-panel reserved-market-card" href="/reserved"><span>{t("Reserved List")}</span><strong>571</strong><small>{locale === "es" ? "cartas únicas" : "unique cards"}</small><ExternalLink size={14} /></Link>
        </section>
        <div className={`market-columns ${loading ? "loading" : ""}`}>
          <section className="fintech-panel"><div className="section-title"><div><span className="eyebrow">{days}D</span><h2>{locale === "es" ? "Mayores subidas" : "Top gainers"}</h2></div><TrendingUp className="up" size={20} /></div><MoverList cards={gainers} direction="up" days={days} /></section>
          <section className="fintech-panel"><div className="section-title"><div><span className="eyebrow">{days}D</span><h2>{locale === "es" ? "Mayores bajadas" : "Top losers"}</h2></div><TrendingDown className="down" size={20} /></div><MoverList cards={losers} direction="down" days={days} /></section>
        </div>
      </div>
    </main>
  );
}
