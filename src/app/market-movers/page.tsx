import Link from "next/link";

/* eslint-disable @next/next/no-img-element */
import { MagicBrainLogo } from "@/components/brand-logo";
import { getMarketMovers } from "@/lib/catalog";

export const dynamic = "force-dynamic";
export const metadata = { title: "Top Magic card price movers · Magic Brain", description: "Public daily ranking of the 50 largest Magic: The Gathering card price increases and decreases over seven days." };

function Ranking({ title, cards }: { title: string; cards: Awaited<ReturnType<typeof getMarketMovers>> }) {
  return <section><h2>{title}</h2><ol>{cards.map((card) => <li key={card.id}><div>{card.imageUrl && <img src={card.imageUrl} alt="" />}<span><strong>{card.name}</strong><small>{card.setName} · {card.setCode.toUpperCase()}</small></span></div><span className={(card.change7d ?? 0) >= 0 ? "positive" : "negative"}><strong>{card.change7d === null ? "—" : `${card.change7d > 0 ? "+" : ""}${card.change7d.toFixed(1)}%`}</strong><small>{card.price === null ? "—" : `€${card.price.toFixed(2)}`}</small></span></li>)}</ol></section>;
}

export default async function MarketMoversPage() {
  const [gainers, losers] = await Promise.all([getMarketMovers(50, "gainers", 7), getMarketMovers(50, "losers", 7)]);
  return <main className="public-movers"><header><Link href="/login"><MagicBrainLogo /></Link><nav><Link href="/developers">Developers</Link><Link href="/login">Open Magic Brain</Link></nav></header><div className="public-movers-heading"><span className="eyebrow">PUBLIC MARKET DATA · UPDATED DAILY</span><h1>Magic card movers over 7 days.</h1><p>The 50 largest observed price increases and decreases across Magic: The Gathering printings tracked by Magic Brain. Price-derived information only; not financial advice.</p><code>GET /api/market/movers?direction=losers&amp;days=7&amp;limit=50</code></div><div className="public-movers-grid"><Ranking title="Top gainers" cards={gainers} /><Ranking title="Largest declines" cards={losers} /></div><footer><Link href="/privacy">Privacy</Link><Link href="/cookies">Cookies</Link><span>Data date: {gainers[0]?.priceDate ?? losers[0]?.priceDate ?? "unavailable"}</span></footer></main>;
}
