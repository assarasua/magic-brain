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
import type { CatalogCard } from "@/lib/catalog";
import { formatCurrency } from "@/lib/data";

function MoverList({
  cards,
  direction,
}: {
  cards: CatalogCard[];
  direction: "up" | "down";
}) {
  return (
    <div className="market-list">
      {cards.map((card, index) => (
        <Link href={`/inventory?q=${encodeURIComponent(card.name)}`} key={card.id}>
          <span className="market-rank">{String(index + 1).padStart(2, "0")}</span>
          {card.imageUrl && <img src={card.imageUrl} alt="" />}
          <div><strong>{card.name}</strong><span>{card.setCode.toUpperCase()} · {card.setName}</span></div>
          <div><strong>{card.price === null ? "—" : formatCurrency(card.price)}</strong><em className={direction === "up" ? "up" : "down"}>{direction === "up" ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{card.change7d === null ? "—" : `${Math.abs(card.change7d).toFixed(1)}%`}</em></div>
          <ArrowRight size={14} />
        </Link>
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
      fetch(`/api/market/movers?direction=gainers&days=${days}`, { signal: controller.signal }).then((response) => response.json()),
      fetch(`/api/market/movers?direction=losers&days=${days}`, { signal: controller.signal }).then((response) => response.json()),
    ])
      .then(([up, down]: Array<{ cards: CatalogCard[] }>) => {
        setGainers(up.cards);
        setLosers(down.cards);
      })
      .finally(() => setLoading(false));
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
          <div className="market-period">{[1, 7, 30].map((value) => <button className={days === value ? "active" : ""} key={value} onClick={() => { setLoading(true); setDays(value); }}>{value}D</button>)}</div>
        </div>
        <section className="market-summary">
          <div className="fintech-panel"><span>{locale === "es" ? "Universo analizado" : "Analysed universe"}</span><strong>117,923</strong><small>{locale === "es" ? "impresiones" : "printings"}</small></div>
          <div className="fintech-panel"><TrendingUp size={18} /><span>{locale === "es" ? "Mayor subida" : "Top gain"}</span><strong className="up">{gainers[0]?.change7d ? `+${gainers[0].change7d.toFixed(1)}%` : "—"}</strong></div>
          <div className="fintech-panel"><TrendingDown size={18} /><span>{locale === "es" ? "Mayor bajada" : "Top decline"}</span><strong className="down">{losers[0]?.change7d ? `${losers[0].change7d.toFixed(1)}%` : "—"}</strong></div>
          <Link className="fintech-panel reserved-market-card" href="/reserved"><span>{t("Reserved List")}</span><strong>571</strong><small>{locale === "es" ? "cartas únicas" : "unique cards"}</small><ExternalLink size={14} /></Link>
        </section>
        <div className={`market-columns ${loading ? "loading" : ""}`}>
          <section className="fintech-panel"><div className="section-title"><div><span className="eyebrow">{days}D</span><h2>{locale === "es" ? "Mayores subidas" : "Top gainers"}</h2></div><TrendingUp className="up" size={20} /></div><MoverList cards={gainers} direction="up" /></section>
          <section className="fintech-panel"><div className="section-title"><div><span className="eyebrow">{days}D</span><h2>{locale === "es" ? "Mayores bajadas" : "Top losers"}</h2></div><TrendingDown className="down" size={20} /></div><MoverList cards={losers} direction="down" /></section>
        </div>
      </div>
    </main>
  );
}
