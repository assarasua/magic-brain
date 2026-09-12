"use client";

/* eslint-disable @next/next/no-img-element */

import {
  ArrowLeft,
  Bell,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { LanguageToggle, useLanguage } from "@/components/language-provider";
import { AuthControl } from "@/components/auth-control";
import { MagicBrainLogo } from "@/components/brand-logo";
import type { CatalogCard } from "@/lib/catalog";
import { formatCurrency } from "@/lib/data";

type WatchedCard = CatalogCard & { targetPrice: number | null };

export default function WatchlistPage() {
  const { locale, t } = useLanguage();
  const [cards, setCards] = useState<WatchedCard[]>([]);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<CatalogCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/watchlist")
      .then((response) => response.json())
      .then((result: { cards: WatchedCard[] }) => setCards(result.cards))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (search.trim().length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/cards/search?q=${encodeURIComponent(search)}`, {
        signal: controller.signal,
      })
        .then((response) => response.json())
        .then((result: { cards: CatalogCard[] }) => setResults(result.cards))
        .catch(() => setResults([]));
    }, 220);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [search]);

  const addCard = async (card: CatalogCard) => {
    const response = await fetch("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: card.id }),
    });
    if (response.ok) {
      const result = (await response.json()) as { cards: WatchedCard[] };
      setCards(result.cards);
      setSearch("");
      setResults([]);
    }
  };

  const removeCard = async (cardId: string) => {
    const response = await fetch(`/api/watchlist?cardId=${cardId}`, {
      method: "DELETE",
    });
    if (response.ok) {
      const result = (await response.json()) as { cards: WatchedCard[] };
      setCards(result.cards);
    }
  };

  const setTarget = async (card: WatchedCard, value: string) => {
    const targetPrice = value ? Number(value) : null;
    const response = await fetch("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: card.id, targetPrice }),
    });
    if (response.ok) {
      const result = (await response.json()) as { cards: WatchedCard[] };
      setCards(result.cards);
    }
  };

  return (
    <main className="account-page">
      <header className="account-topbar">
        <Link href="/" className="inventory-brand"><MagicBrainLogo /></Link>
        <nav><Link href="/inventory">{t("Inventory")}</Link><Link href="/reserved">{t("Reserved List")}</Link><Link href="/portfolio">{t("Portfolio")}</Link></nav>
        <LanguageToggle />
        <AuthControl compact />
        <Link href="/" className="back-dashboard"><ArrowLeft size={15} /> {t("Dashboard")}</Link>
      </header>

      <div className="account-content watchlist-content">
        <div className="account-heading">
          <div><span className="eyebrow">{locale === "es" ? "Radar de mercado" : "Market radar"}</span><h1>{t("Watchlist")}</h1><p>{locale === "es" ? "Sigue precios y configura tus puntos de entrada." : "Monitor prices and define your ideal entry points."}</p></div>
          <div className="watch-search">
            <Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={locale === "es" ? "Añadir una carta…" : "Add a card…"} />
            {search.trim().length >= 2 && results.length > 0 && <div>{results.map((card) => <button key={card.id} onClick={() => addCard(card)}>{card.imageUrl && <img src={card.imageUrl} alt="" />}<span><strong>{card.name}</strong><small>{card.setCode.toUpperCase()} · {card.setName}</small></span><Plus size={15} /></button>)}</div>}
          </div>
        </div>

        <section className="watch-overview">
          <div className="fintech-panel"><Bell size={19} /><span>{locale === "es" ? "Cartas seguidas" : "Tracked cards"}</span><strong>{cards.length}</strong></div>
          <div className="fintech-panel"><span>{locale === "es" ? "Ganadores hoy" : "Positive signals"}</span><strong className="up">{cards.filter((card) => (card.change7d ?? 0) > 0).length}</strong><small>{locale === "es" ? "últimos 7 días" : "over 7 days"}</small></div>
          <div className="fintech-panel"><span>{locale === "es" ? "Alertas alcanzadas" : "Targets reached"}</span><strong>{cards.filter((card) => card.targetPrice !== null && card.price !== null && card.price <= card.targetPrice).length}</strong><small>{locale === "es" ? "listas para revisar" : "ready to review"}</small></div>
        </section>

        <section className="fintech-panel watch-table">
          <div className="section-title"><div><span className="eyebrow">{locale === "es" ? "Seguimiento personal" : "Personal tracking"}</span><h2>{locale === "es" ? "Señales de precio" : "Price signals"}</h2></div></div>
          {loading ? <div className="table-empty">Loading…</div> : cards.length === 0 ? <div className="table-empty"><Bell size={27} /><strong>{locale === "es" ? "Tu lista está vacía" : "Your watchlist is empty"}</strong><p>{locale === "es" ? "Busca una carta arriba para empezar." : "Search for a card above to start tracking it."}</p></div> : cards.map((card) => (
            <article className="watch-row" key={card.id}>
              {card.imageUrl && <img src={card.imageUrl} alt="" />}
              <div><strong>{card.name}</strong><span>{card.setCode.toUpperCase()} · {card.setName}</span></div>
              <div><span>{locale === "es" ? "Precio actual" : "Current price"}</span><strong>{card.price === null ? "—" : formatCurrency(card.price)}</strong></div>
              <div><span>7D</span><strong className={(card.change7d ?? 0) >= 0 ? "up" : "down"}>{card.change7d === null ? "—" : `${card.change7d >= 0 ? "+" : ""}${card.change7d.toFixed(2)}%`}</strong></div>
              <label><span>{locale === "es" ? "Precio objetivo" : "Target price"}</span><div>€ <input type="number" step=".01" min="0" defaultValue={card.targetPrice ?? ""} onBlur={(event) => setTarget(card, event.target.value)} /></div></label>
              <button onClick={() => removeCard(card.id)} aria-label={`Remove ${card.name}`}><Trash2 size={15} /></button>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
