"use client";

/* eslint-disable @next/next/no-img-element */

import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Bookmark,
  BrainCircuit,
  ChevronDown,
  CircleDollarSign,
  Code2,
  Crown,
  ExternalLink,
  Eye,
  Heart,
  LayoutDashboard,
  LibraryBig,
  Menu,
  MessageCircleQuestion,
  Plus,
  Search,
  Settings,
  Sparkles,
  TrendingDown,
  TrendingUp,
  WalletCards,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { LanguageToggle, useLanguage } from "@/components/language-provider";
import { AuthControl } from "@/components/auth-control";
import { MagicBrainLogo } from "@/components/brand-logo";
import { PortfolioOnboarding } from "@/components/portfolio-onboarding";
import { useCardDetail } from "@/components/card-detail-provider";
import {
  Card,
  formatCurrency,
  movers,
} from "@/lib/data";
import type { CatalogCard } from "@/lib/catalog";
import type { PortfolioHolding } from "@/lib/portfolio";

const nav = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Market", icon: TrendingUp },
  { label: "Inventory", icon: LibraryBig },
  { label: "Reserved List", icon: Crown },
  { label: "Portfolio", icon: WalletCards },
  { label: "Watchlist", icon: Eye },
  { label: "Support", icon: CircleDollarSign },
  { label: "Developers", icon: Code2 },
];

const brainNav = [
  { label: "Brain Pro", href: "/brain-pro", icon: Crown },
  { label: "Portfolio Builder", href: "/brain", icon: BrainCircuit },
  { label: "Brain Signals", href: "/signals", icon: TrendingUp },
  { label: "Ask Brain", href: "/analyst", icon: MessageCircleQuestion },
  { label: "Discover", href: "/discover", icon: Heart },
];

function Brand({ compact = false }: { compact?: boolean }) {
  return <MagicBrainLogo compact={compact} />;
}

function Sparkline({
  values,
  positive = true,
  large = false,
}: {
  values: number[];
  positive?: boolean;
  large?: boolean;
}) {
  const width = large ? 720 : 112;
  const height = large ? 190 : 42;
  const padding = large ? 6 : 3;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const points = values
    .map((value, index) => {
      const x = padding + (index / (values.length - 1)) * (width - padding * 2);
      const y =
        height -
        padding -
        ((value - min) / Math.max(max - min, 1)) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      className={large ? "portfolio-chart" : "sparkline"}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${positive ? "Rising" : "falling"} price trend`}
      preserveAspectRatio="none"
    >
      {large && (
        <>
          <defs>
            <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#48b9ff" stopOpacity=".28" />
              <stop offset="100%" stopColor="#48b9ff" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon
            points={`${padding},${height} ${points} ${width - padding},${height}`}
            fill="url(#chartFill)"
          />
        </>
      )}
      <polyline
        points={points}
        fill="none"
        stroke={positive ? "#48b9ff" : "#ff6b77"}
        strokeWidth={large ? 3 : 2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Change({ value }: { value: number }) {
  const positive = value >= 0;
  return (
    <span className={`change ${positive ? "positive" : "negative"}`}>
      {positive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

function CardRow({
  card,
  watched,
  onToggle,
}: {
  card: Card;
  watched: boolean;
  onToggle: () => void;
}) {
  const { cardSurfaceProps } = useCardDetail();
  const cardmarketUrl = new URL(
    "https://www.cardmarket.com/en/Magic/Products/Search",
  );
  cardmarketUrl.searchParams.set("searchString", card.name);
  const referrer = process.env.NEXT_PUBLIC_CARDMARKET_REFERRER;
  if (referrer) cardmarketUrl.searchParams.set("referrer", referrer);

  return (
    <div className="card-row card-surface" {...cardSurfaceProps(card.id)}>
      <img src={card.image} alt="" className="card-thumb" />
      <div className="card-identity">
        <strong>{card.name}</strong>
        <span>
          {card.setCode} · {card.rarity}
        </span>
      </div>
      <div className="row-chart">
        <Sparkline values={card.sparkline} positive={card.change >= 0} />
      </div>
      <div className="row-price">
        <strong>{formatCurrency(card.price)}</strong>
        <Change value={card.change} />
      </div>
      <a
        className="buy-link"
        href={cardmarketUrl.toString()}
        target="_blank"
        rel="noopener noreferrer sponsored"
        aria-label={`View ${card.name} on Cardmarket`}
      >
        Buy <ExternalLink size={11} />
      </a>
      <button
        className={`icon-btn bookmark ${watched ? "active" : ""}`}
        onClick={onToggle}
        aria-label={watched ? `Remove ${card.name} from watchlist` : `Watch ${card.name}`}
      >
        <Bookmark size={17} fill={watched ? "currentColor" : "none"} />
      </button>
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const { openCard, cardSurfaceProps } = useCardDetail();
  const { locale, t } = useLanguage();
  const searchInput = useRef<HTMLInputElement>(null);
  const [activeNav, setActiveNav] = useState("Overview");
  const [timeframe, setTimeframe] = useState("30D");
  const [marketCards, setMarketCards] = useState<Card[]>(movers);
  const [marketDirection, setMarketDirection] = useState<"gainers" | "losers">("gainers");
  const [marketDays, setMarketDays] = useState<1 | 7 | 30>(7);
  const [marketLoading, setMarketLoading] = useState(true);
  const [watchlist, setWatchlist] = useState<string[]>([
    movers[0].id,
    movers[1].id,
  ]);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CatalogCard[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [brainExpanded, setBrainExpanded] = useState(false);
  const [toast, setToast] = useState("");
  const [portfolioLoaded, setPortfolioLoaded] = useState(false);
  const [portfolio, setPortfolio] = useState<{
    holdings: PortfolioHolding[];
    summary: {
      invested: number;
      value: number;
      gain: number;
      gainPercent: number;
      cardCount: number;
    };
    history: Array<{ date: string; value: number; invested: number }>;
  }>({
    holdings: [],
    summary: { invested: 0, value: 0, gain: 0, gainPercent: 0, cardCount: 0 },
    history: [],
  });

  const filteredMovers = useMemo(
    () =>
      marketCards.filter((card) =>
        card.name.toLowerCase().includes(query.toLowerCase()),
      ),
    [marketCards, query],
  );

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInput.current?.focus();
      }

      if (event.key === "Escape") {
        setQuery("");
        setSearchLoading(false);
        searchInput.current?.blur();
      }
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("/api/portfolio")
        .then((response) => response.json())
        .then((portfolioResult) => {
          setPortfolio(portfolioResult);
          setPortfolioLoaded(true);
        }),
      fetch("/api/watchlist")
        .then((response) => response.json())
        .then((watchlistResult: { cards: CatalogCard[] }) =>
          setWatchlist(watchlistResult.cards.map((card) => card.id)),
        ),
    ])
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length < 2) return;

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearchLoading(true);
      fetch(`/api/cards/search?q=${encodeURIComponent(normalized)}`, {
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) throw new Error("Search unavailable");
          return (await response.json()) as { cards: CatalogCard[] };
        })
        .then((result) => setSearchResults(result.cards))
        .catch((error: Error) => {
          if (error.name !== "AbortError") setSearchResults([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearchLoading(false);
        });
    }, 220);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/market/movers?direction=${marketDirection}&days=${marketDays}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Market data unavailable");
        return (await response.json()) as { cards: CatalogCard[] };
      })
      .then(({ cards }) => {
        setMarketCards(
          cards.map((card) => {
            const price = card.price ?? 0;
            const change = card.change7d ?? 0;
            const startingPrice = price / (1 + change / 100);
            const sparkline = Array.from({ length: 10 }, (_, index) => {
              const progress = index / 9;
              const variation = Math.sin(index * 1.8) * price * 0.012;
              return startingPrice + (price - startingPrice) * progress + variation;
            });

            return {
              id: card.id,
              name: card.name,
              set: card.setName,
              setCode: card.setCode.toUpperCase(),
              price,
              change,
              sparkline,
              image: card.imageUrl ?? "",
              rarity: card.rarity,
            };
          }),
        );
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") {
          // Keep the previous cards when live market data is unavailable.
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setMarketLoading(false);
      });
    return () => controller.abort();
  }, [marketDays, marketDirection]);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  };

  const toggleWatch = async (id: string) => {
    const watched = watchlist.includes(id);
    setWatchlist((current) =>
      watched ? current.filter((cardId) => cardId !== id) : [...current, id],
    );
    const response = await fetch(
      watched ? `/api/watchlist?cardId=${id}` : "/api/watchlist",
      {
        method: watched ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: watched ? undefined : JSON.stringify({ cardId: id }),
      },
    );
    if (!response.ok) {
      setWatchlist((current) =>
        watched ? [...current, id] : current.filter((cardId) => cardId !== id),
      );
      showToast("Unable to update watchlist");
    }
  };

  return (
    <main className="app-shell">
      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <div className="sidebar-head">
          <Brand />
          <button
            className="icon-btn mobile-close"
            onClick={() => setMobileNav(false)}
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>
        <nav>
          <span className="nav-caption">{t("Workspace")}</span>
          {nav.map(({ label, icon: Icon }) => (
            <button
              key={label}
              className={[
                "nav-item",
                activeNav === label ? "active" : "",
              ].filter(Boolean).join(" ")}
              onClick={() => {
                const routes: Record<string, string> = {
                  Market: "/market",
                  Inventory: "/inventory",
                  "Reserved List": "/reserved",
                  Portfolio: "/portfolio",
                  Watchlist: "/watchlist",
                  Support: "/donate",
                  Developers: "/developers",
                };
                if (routes[label]) {
                  router.push(routes[label]);
                  return;
                }
                setActiveNav(label);
                setMobileNav(false);
                if (label !== "Overview") {
                  showToast(`${label} workspace is ready for your live data`);
                }
              }}
            >
              <Icon size={18} />
              {t(label)}
              {label === "Watchlist" && <span className="nav-count">{watchlist.length}</span>}
            </button>
          ))}
          <div className={`sidebar-section-group ${brainExpanded ? "open" : ""}`}>
            <button
              className="nav-item premium-feature-link sidebar-section-trigger"
              aria-expanded={brainExpanded}
              onClick={() => setBrainExpanded((current) => !current)}
            >
              <Sparkles size={18} />
              Brain Pro
              <span className="nav-pro-label"><Crown size={10} /> {locale === "es" ? "GRATIS" : "FREE"}</span>
              <ChevronDown className="sidebar-section-chevron" size={14} />
            </button>
            {brainExpanded && (
              <div className="sidebar-subnav">
                {brainNav.map(({ label, href, icon: Icon }) => (
                  <button key={href} onClick={() => router.push(href)}>
                    <Icon size={15} />
                    {t(label)}
                  </button>
                ))}
              </div>
            )}
          </div>
          <span className="nav-caption lower">{t("Account")}</span>
          <button className="nav-item">
            <Bell size={18} />
            {t("Alerts")}
            <span className="premium-dot" />
          </button>
          <button className="nav-item" onClick={() => router.push("/settings")}>
            <Settings size={18} />
            {t("Settings")}
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="mini-upgrade">
            <span className="crown">
              <CircleDollarSign size={16} />
            </span>
            <strong>{locale === "es" ? "Apoya Magic Brain" : "Support Magic Brain"}</strong>
            <p>{locale === "es" ? "Ayuda a mantener el proyecto abierto." : "Help keep the project open."}</p>
            <Link href="/donate">{locale === "es" ? "Hacer una donación" : "Make a donation"} <ArrowRight size={14} /></Link>
          </div>
          <AuthControl />
        </div>
      </aside>

      {mobileNav && <button className="scrim" onClick={() => setMobileNav(false)} aria-label="Close navigation" />}

      <section className="main-panel">
        <header className="topbar">
          <button className="icon-btn menu-button" onClick={() => setMobileNav(true)} aria-label="Open menu">
            <Menu size={21} />
          </button>
          <div className="mobile-brand"><Brand compact /></div>
          <div className="search-wrap">
            <label className="search">
              <Search size={17} />
              <input
                ref={searchInput}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  if (event.target.value.trim().length < 2) {
                    setSearchLoading(false);
                  }
                }}
                placeholder={t("Search cards, sets or artists...")}
              />
              <kbd>⌘ K</kbd>
            </label>
            {query.trim() && (
              <div className="search-results">
                <span className="search-results-label">
                  {query.trim().length < 2
                    ? "Type at least 2 characters"
                    : searchLoading
                      ? "Searching all printings…"
                      : searchResults.length
                      ? "Cards"
                      : "No matching cards"}
                </span>
                {query.trim().length >= 2 && searchResults.map((card) => (
                  <button
                    key={card.id}
                    onClick={() => {
                      openCard(card);
                      setQuery("");
                    }}
                  >
                    {card.imageUrl ? <img src={card.imageUrl} alt="" /> : <span />}
                    <span>
                      <strong>{card.name}</strong>
                      <small>{card.setCode.toUpperCase()} · {card.setName}</small>
                    </span>
                    <b>{card.price === null ? "No price" : formatCurrency(card.price)}</b>
                  </button>
                ))}
              </div>
            )}
          </div>
          <LanguageToggle />
          <AuthControl compact />
          <button className="icon-btn notification" aria-label="Notifications">
            <Bell size={19} />
            <span />
          </button>
          <button className="primary-button" onClick={() => router.push("/portfolio")}>
            <Plus size={17} /> {t("Add holding")}
          </button>
        </header>

        <div className="content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">{locale === "es" ? "Sábado, 12 de septiembre" : "Saturday, 12 September"}</span>
              <h1>{t("Your collection, in focus.")}</h1>
              <p>{t("Track market momentum and make your next move with confidence.")}</p>
            </div>
            <div className="market-status"><span /> {locale === "es" ? "Precios actualizados hace 12 min" : "Cardmarket prices updated 12 min ago"}</div>
          </div>

          {portfolioLoaded && portfolio.summary.cardCount === 0 && <PortfolioOnboarding compact />}

          <section className="metrics-grid">
            <article className="metric-card featured">
              <div className="metric-label"><WalletCards size={17} /> {t("Portfolio value")}</div>
              <strong>{formatCurrency(portfolio.summary.value)}</strong>
              <div className="metric-foot">
                <Change value={portfolio.summary.gainPercent} />
                <span>{portfolio.summary.gain >= 0 ? "+" : ""}{formatCurrency(portfolio.summary.gain)} {locale === "es" ? "total" : "all time"}</span>
              </div>
              <span className="metric-glow" />
            </article>
            <article className="metric-card">
              <div className="metric-label"><CircleDollarSign size={17} /> {t("Total invested")}</div>
              <strong>{formatCurrency(portfolio.summary.invested)}</strong>
              <div className="metric-foot"><span>{locale === "es" ? `En ${portfolio.summary.cardCount} cartas` : `Across ${portfolio.summary.cardCount} cards`}</span></div>
            </article>
            <article className="metric-card">
              <div className="metric-label"><TrendingUp size={17} /> {t("Unrealised return")}</div>
              <strong className={portfolio.summary.gain >= 0 ? "positive-text" : "negative"}>{portfolio.summary.gain >= 0 ? "+" : ""}{formatCurrency(portfolio.summary.gain)}</strong>
              <div className="metric-foot"><Change value={portfolio.summary.gainPercent} /><span>{locale === "es" ? "Total" : "All time"}</span></div>
            </article>
            <article className="metric-card">
              <div className="metric-label"><Eye size={17} /> {t("Watchlist")}</div>
              <strong>{watchlist.length} <small>cards</small></strong>
              <div className="metric-foot"><span>{locale === "es" ? "Alertas de precio activas" : "Active price alerts"}</span></div>
            </article>
          </section>

          <div className="dashboard-grid">
            <section className="panel portfolio-panel">
              <div className="panel-head">
                <div><span className="panel-kicker">{t("Portfolio performance")}</span><h2>{formatCurrency(portfolio.summary.value)}</h2></div>
                <div className="range-switch">
                  {["7D", "30D", "3M", "1Y"].map((range) => (
                    <button key={range} onClick={() => setTimeframe(range)} className={timeframe === range ? "active" : ""}>{range}</button>
                  ))}
                </div>
              </div>
              <div className="chart-meta"><Change value={portfolio.summary.gainPercent} /><span>{locale === "es" ? "vs coste de compra" : "vs cost basis"}</span></div>
              <div className="chart-wrap">
                <div className="chart-guides"><i /><i /><i /><i /></div>
                <Sparkline values={portfolio.history.length > 1 ? portfolio.history.map((point) => point.value) : [0, 0]} large />
                <div className="chart-labels"><span>14 Aug</span><span>21 Aug</span><span>28 Aug</span><span>4 Sep</span><span>Today</span></div>
              </div>
            </section>

            <section className="panel insight-panel">
              <div className="insight-icon"><Sparkles size={21} /></div>
              <span className="panel-kicker">{t("Brain signal")}</span>
              <h2>{locale === "es" ? "Las cartas básicas de Commander ganan impulso." : "Commander staples are gaining momentum."}</h2>
              <p>{locale === "es" ? "Los encantamientos azules subieron un 7,2% esta semana, impulsados por las ediciones premium." : "Blue enchantments rose 7.2% this week, led by renewed demand for premium printings."}</p>
              <button onClick={() => router.push("/signals")}>
                {locale === "es" ? "Ver análisis" : "View market insight"} <ArrowRight size={15} />
              </button>
              <div className="signal-bars"><i /><i /><i /><i /><i /><i /><i /></div>
            </section>
          </div>

          <section className={`panel movers-panel ${marketLoading ? "loading" : ""}`} aria-live="polite" aria-busy={marketLoading}>
            <div className="panel-head movers-head">
              <div><span className="panel-kicker">{t("Market pulse")} · {marketDays}D</span><h2>{marketDirection === "gainers" ? (locale === "es" ? "Mayores subidas" : "Top gainers") : (locale === "es" ? "Mayores bajadas" : "Top losers")}</h2></div>
              <div className="market-tabs" aria-label={locale === "es" ? "Controles de tendencias" : "Market mover controls"}>
                <button className={marketDirection === "gainers" ? "active" : ""} aria-pressed={marketDirection === "gainers"} onClick={() => { if (marketDirection !== "gainers") { setMarketLoading(true); setMarketDirection("gainers"); } }}><TrendingUp size={12} /> {locale === "es" ? "Subidas" : "Gainers"}</button>
                <button className={marketDirection === "losers" ? "active" : ""} aria-pressed={marketDirection === "losers"} onClick={() => { if (marketDirection !== "losers") { setMarketLoading(true); setMarketDirection("losers"); } }}><TrendingDown size={12} /> {locale === "es" ? "Bajadas" : "Losers"}</button>
                {[1, 7, 30].map((days) => <button key={days} className={marketDays === days ? "active period" : "period"} aria-pressed={marketDays === days} onClick={() => { if (marketDays !== days) { setMarketLoading(true); setMarketDays(days as 1 | 7 | 30); } }}>{days}D</button>)}
              </div>
              <button className="text-button" onClick={() => router.push("/market")}>{t("View market")} <ArrowRight size={15} /></button>
            </div>
            <div className="rows">
              {filteredMovers.length ? (
                filteredMovers.slice(0, 4).map((card) => (
                  <CardRow
                    key={card.id}
                    card={card}
                    watched={watchlist.includes(card.id)}
                    onToggle={() => toggleWatch(card.id)}
                  />
                ))
              ) : (
                <div className="empty-state">No cards match “{query}”.</div>
              )}
            </div>
          </section>

          <section className="bottom-grid">
            <div className="panel holdings-panel">
              <div className="panel-head">
                <div><span className="panel-kicker">{t("Your collection")}</span><h2>{t("Top holdings")}</h2></div>
                <button className="text-button" onClick={() => router.push("/portfolio")}>{t("See all")} <ArrowRight size={15} /></button>
              </div>
              {portfolio.holdings.slice(0, 3).map((holding) => (
                <div className="holding card-surface" key={holding.id} {...cardSurfaceProps(holding.cardId)}>
                  {holding.imageUrl && <img src={holding.imageUrl} alt="" />}
                  <div><strong>{holding.name}</strong><span>{holding.quantity} copies · {holding.setCode.toUpperCase()}</span></div>
                  <div><strong>{holding.currentValue === null ? "—" : formatCurrency(holding.currentValue)}</strong><Change value={holding.gainPercent ?? 0} /></div>
                </div>
              ))}
              {!portfolio.holdings.length && <div className="empty-holdings">Add your first card to start tracking returns.</div>}
            </div>

            <div className="panel premium-panel">
              <div className="premium-copy">
                <span className="pro-pill"><CircleDollarSign size={13} /> {locale === "es" ? "APOYA EL PROYECTO" : "SUPPORT THE PROJECT"}</span>
                <h2>{locale === "es" ? "Ayuda a construir una inteligencia de mercado abierta." : "Help build open market intelligence."}</h2>
                <p>{locale === "es" ? "Todas las herramientas están disponibles gratis. Tu donación ayuda a mantener los datos, la infraestructura y el desarrollo." : "Every tool is available for free. Your donation helps fund data, infrastructure, and continued development."}</p>
                <button onClick={() => router.push("/donate")}>
                  {locale === "es" ? "Donar al proyecto" : "Donate to the project"} <ArrowRight size={15} />
                </button>
                <span className="no-card">{locale === "es" ? "Contribución voluntaria · PayPal P2P" : "Voluntary contribution · PayPal P2P"}</span>
              </div>
              <div className="premium-visual">
                <CircleDollarSign size={64} />
              </div>
            </div>
          </section>

          <footer>
            <span>Market data for information only. Not financial advice.</span>
            <span className="community-footer-links">
              <Link href="/developers">Developers</Link>
              <a href="https://github.com/assarasua/magic-brain">GitHub</a>
              <span>Magic Brain is not affiliated with Wizards of the Coast.</span>
            </span>
          </footer>
        </div>
      </section>

      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}
