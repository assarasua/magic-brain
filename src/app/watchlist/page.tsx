"use client";

/* eslint-disable @next/next/no-img-element */

import {
  ArrowLeft,
  ArrowDownToLine,
  ArrowUpFromLine,
  Bell,
  Check,
  Plus,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { LanguageToggle, useLanguage } from "@/components/language-provider";
import { AuthControl } from "@/components/auth-control";
import { MagicBrainLogo } from "@/components/brand-logo";
import { useCardDetail } from "@/components/card-detail-provider";
import { SetSelector } from "@/components/set-selector";
import type { CatalogCard } from "@/lib/catalog";
import { formatCurrency } from "@/lib/data";

type WatchedCard = CatalogCard & {
  targetPrice: number | null;
  alertBelowEnabled: boolean;
  alertAbovePrice: number | null;
  alertAboveEnabled: boolean;
  belowTriggeredAt: string | null;
  belowReadAt: string | null;
  aboveTriggeredAt: string | null;
  aboveReadAt: string | null;
};

export default function WatchlistPage() {
  const { locale, t } = useLanguage();
  const { cardSurfaceProps } = useCardDetail();
  const [cards, setCards] = useState<WatchedCard[]>([]);
  const [search, setSearch] = useState("");
  const [setCodes, setSetCodes] = useState<string[]>([]);
  const [results, setResults] = useState<CatalogCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingAlertId, setEditingAlertId] = useState<string | null>(null);

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
      fetch(`/api/cards/search?q=${encodeURIComponent(search)}${setCodes[0] ? `&set=${encodeURIComponent(setCodes[0])}` : ""}`, {
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
  }, [search, setCodes]);

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
      if (editingAlertId === cardId) setEditingAlertId(null);
    }
  };

  const updateAlerts = async (
    card: WatchedCard,
    updates: Partial<Pick<
      WatchedCard,
      "targetPrice" | "alertBelowEnabled" | "alertAbovePrice" | "alertAboveEnabled"
    >>,
  ) => {
    const response = await fetch("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: card.id, ...updates }),
    });
    if (response.ok) {
      const result = (await response.json()) as { cards: WatchedCard[] };
      setCards(result.cards);
    }
  };

  const updateAlertState = async (
    card: WatchedCard,
    direction: "below" | "above",
    action: "dismiss" | "reset",
  ) => {
    const response = await fetch("/api/watchlist", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: card.id, direction, action }),
    });
    if (response.ok) {
      const result = (await response.json()) as { cards: WatchedCard[] };
      setCards(result.cards);
    }
  };

  const visibleCards = setCodes[0]
    ? cards.filter((card) => card.setCode.toLowerCase() === setCodes[0])
    : cards;
  const triggeredCount = visibleCards.reduce(
    (count, card) =>
      count +
      Number(Boolean(card.belowTriggeredAt && !card.belowReadAt)) +
      Number(Boolean(card.aboveTriggeredAt && !card.aboveReadAt)),
    0,
  );
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
          <div className="watchlist-tools">
            <SetSelector
              value={setCodes}
              onChange={setSetCodes}
              label={locale === "es" ? "Edición" : "Set"}
              allLabel={locale === "es" ? "Todas" : "All sets"}
            />
            <div className="watch-search">
              <Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={locale === "es" ? "Añadir una carta…" : "Add a card…"} />
              {search.trim().length >= 2 && results.length > 0 && <div>{results.map((card) => <button key={card.id} onClick={() => addCard(card)}>{card.imageUrl && <img src={card.imageUrl} alt="" />}<span><strong>{card.name}</strong><small>{card.setCode.toUpperCase()} · {card.setName}</small></span><Plus size={15} /></button>)}</div>}
            </div>
          </div>
        </div>

        <section className="watch-overview">
          <div className="fintech-panel"><Bell size={19} /><span>{locale === "es" ? "Cartas seguidas" : "Tracked cards"}</span><strong>{visibleCards.length}</strong></div>
          <div className="fintech-panel"><span>{locale === "es" ? "Ganadores hoy" : "Positive signals"}</span><strong className="up">{visibleCards.filter((card) => (card.change7d ?? 0) > 0).length}</strong><small>{locale === "es" ? "últimos 7 días" : "over 7 days"}</small></div>
          <div className="fintech-panel"><span>{locale === "es" ? "Alertas nuevas" : "New alerts"}</span><strong>{triggeredCount}</strong><small>{locale === "es" ? "listas para revisar" : "ready to review"}</small></div>
        </section>

        <section className="fintech-panel watch-table">
          <div className="section-title"><div><span className="eyebrow">{locale === "es" ? "Seguimiento personal" : "Personal tracking"}</span><h2>{locale === "es" ? "Señales de precio" : "Price signals"}</h2></div></div>
          {loading ? <div className="table-empty">Loading…</div> : visibleCards.length === 0 ? <div className="table-empty"><Bell size={27} /><strong>{setCodes[0] ? (locale === "es" ? "No hay cartas de esta edición" : "No cards from this set") : (locale === "es" ? "Tu lista está vacía" : "Your watchlist is empty")}</strong><p>{locale === "es" ? "Busca una carta arriba para empezar." : "Search for a card above to start tracking it."}</p></div> : visibleCards.map((card) => (
            <article className="watch-row card-surface" key={card.id} {...cardSurfaceProps(card)}>
              {card.imageUrl && <img src={card.imageUrl} alt="" />}
              <div><strong>{card.name}</strong><span>{card.setCode.toUpperCase()} · {card.setName}</span></div>
              <div><span>{locale === "es" ? "Precio actual" : "Current price"}</span><strong>{card.price === null ? "—" : formatCurrency(card.price)}</strong></div>
              <div><span>7D</span><strong className={(card.change7d ?? 0) >= 0 ? "up" : "down"}>{card.change7d === null ? "—" : `${card.change7d >= 0 ? "+" : ""}${card.change7d.toFixed(2)}%`}</strong></div>
              {editingAlertId === card.id ? (
                <div className="watch-alert-editor">
                  <header><span><Bell size={13} /> {locale === "es" ? "Configurar alerta opcional" : "Configure optional alert"}</span><button onClick={() => setEditingAlertId(null)}><Check size={13} /> {locale === "es" ? "Listo" : "Done"}</button></header>
                  <div className="watch-alerts">
                    <div className={`watch-alert ${card.belowTriggeredAt ? "triggered" : ""} ${card.belowReadAt ? "dismissed" : ""}`}>
                      <button className={`alert-toggle ${card.alertBelowEnabled ? "active" : ""}`} onClick={() => updateAlerts(card, { alertBelowEnabled: !card.alertBelowEnabled })} aria-pressed={card.alertBelowEnabled} aria-label={`${card.alertBelowEnabled ? "Disable" : "Enable"} price drop alert`}>
                        <ArrowDownToLine size={14} />{card.alertBelowEnabled && <Check size={10} />}
                      </button>
                      <label><span>{locale === "es" ? "Avísame si baja de" : "Alert me below"}</span><div>€ <input type="number" step=".01" min="0" defaultValue={card.targetPrice ?? ""} onBlur={(event) => updateAlerts(card, { targetPrice: event.target.value ? Number(event.target.value) : null, alertBelowEnabled: Boolean(event.target.value) })} /></div></label>
                      {card.belowTriggeredAt && <div className="alert-status"><strong>{card.belowReadAt ? (locale === "es" ? "Descartada" : "Dismissed") : (locale === "es" ? "Activada" : "Triggered")}</strong>{card.belowReadAt ? <button onClick={() => updateAlertState(card, "below", "reset")}><RotateCcw size={11} /> {locale === "es" ? "Reactivar" : "Reset"}</button> : <button onClick={() => updateAlertState(card, "below", "dismiss")}>{locale === "es" ? "Descartar" : "Dismiss"}</button>}</div>}
                    </div>
                    <div className={`watch-alert ${card.aboveTriggeredAt ? "triggered" : ""} ${card.aboveReadAt ? "dismissed" : ""}`}>
                      <button className={`alert-toggle ${card.alertAboveEnabled ? "active" : ""}`} onClick={() => updateAlerts(card, { alertAboveEnabled: !card.alertAboveEnabled })} aria-pressed={card.alertAboveEnabled} aria-label={`${card.alertAboveEnabled ? "Disable" : "Enable"} price rise alert`}>
                        <ArrowUpFromLine size={14} />{card.alertAboveEnabled && <Check size={10} />}
                      </button>
                      <label><span>{locale === "es" ? "Avísame si sube de" : "Alert me above"}</span><div>€ <input type="number" step=".01" min="0" defaultValue={card.alertAbovePrice ?? ""} onBlur={(event) => updateAlerts(card, { alertAbovePrice: event.target.value ? Number(event.target.value) : null, alertAboveEnabled: Boolean(event.target.value) })} /></div></label>
                      {card.aboveTriggeredAt && <div className="alert-status"><strong>{card.aboveReadAt ? (locale === "es" ? "Descartada" : "Dismissed") : (locale === "es" ? "Activada" : "Triggered")}</strong>{card.aboveReadAt ? <button onClick={() => updateAlertState(card, "above", "reset")}><RotateCcw size={11} /> {locale === "es" ? "Reactivar" : "Reset"}</button> : <button onClick={() => updateAlertState(card, "above", "dismiss")}>{locale === "es" ? "Descartar" : "Dismiss"}</button>}</div>}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="watch-alert-summary">
                  <div>
                    {card.alertBelowEnabled && card.targetPrice !== null && <span className={card.belowTriggeredAt && !card.belowReadAt ? "triggered" : ""}><ArrowDownToLine size={12} /> {locale === "es" ? "Baja de" : "Below"} {formatCurrency(card.targetPrice)}</span>}
                    {card.alertAboveEnabled && card.alertAbovePrice !== null && <span className={card.aboveTriggeredAt && !card.aboveReadAt ? "triggered" : ""}><ArrowUpFromLine size={12} /> {locale === "es" ? "Sube de" : "Above"} {formatCurrency(card.alertAbovePrice)}</span>}
                    {!card.alertBelowEnabled && !card.alertAboveEnabled && <small>{locale === "es" ? "Sin alertas" : "No alerts"}</small>}
                  </div>
                  <button onClick={() => setEditingAlertId(card.id)}><Bell size={13} /> {card.alertBelowEnabled || card.alertAboveEnabled ? (locale === "es" ? "Editar alerta" : "Edit alert") : (locale === "es" ? "Crear alerta" : "Set alert")}</button>
                </div>
              )}
              <button className="watch-remove" onClick={() => removeCard(card.id)} aria-label={`Remove ${card.name}`}><Trash2 size={15} /></button>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
