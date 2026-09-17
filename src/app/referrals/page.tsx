"use client";

import { Check, Share2, Trophy, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { useLanguage } from "@/components/language-provider";

type ReferralData = {
  url: string;
  count: number;
  rank: number;
  leaderboard: Array<{ position: number; name: string; count: number }>;
};

export default function ReferralsPage() {
  const { locale } = useLanguage();
  const es = locale === "es";
  const [data, setData] = useState<ReferralData | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/referrals", { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<ReferralData> : Promise.reject())
      .then(setData)
      .catch(() => setData(null));
  }, []);

  const share = async () => {
    if (!data) return;
    const text = es ? "Descubre y organiza tus cartas de Magic con Magic Brain." : "Discover and organize your Magic cards with Magic Brain.";
    if (navigator.share) await navigator.share({ title: "Magic Brain", text, url: data.url });
    else {
      await navigator.clipboard.writeText(data.url);
      setCopied(true);
    }
  };

  return (
    <main className="referral-page">
      <section className="referral-hero">
        <span className="eyebrow"><Trophy size={14} /> {es ? "CLASIFICACIÓN DE REFERIDOS" : "REFERRAL LEADERBOARD"}</span>
        <h1>{es ? "Invita a coleccionistas. Llega al número uno." : "Invite collectors. Reach number one."}</h1>
        <p>{es ? "Comparte tu enlace. Cada nueva cuenta válida suma un referido y mejora tu posición en el ranking." : "Share your link. Every valid new account adds one referral and moves you up the leaderboard."}</p>
        <div className="referral-stats">
          <div><Users size={18} /><strong>{data?.count ?? "—"}</strong><span>{es ? "referidos" : "referrals"}</span></div>
          <div><Trophy size={18} /><strong>{data ? `#${data.rank}` : "—"}</strong><span>{es ? "posición" : "position"}</span></div>
        </div>
      </section>

      <section className="referral-share panel">
        <div><span className="panel-kicker">{es ? "TU ENLACE" : "YOUR LINK"}</span><h2>{es ? "Compártelo con tu comunidad." : "Share it with your community."}</h2></div>
        <div className="referral-link"><input readOnly value={data?.url ?? (es ? "Cargando…" : "Loading…")} aria-label={es ? "Enlace de referido" : "Referral link"} /><button onClick={() => void share()} disabled={!data}>{copied ? <Check size={16} /> : <Share2 size={16} />}{copied ? (es ? "Copiado" : "Copied") : (es ? "Compartir" : "Share")}</button></div>
        <small>{es ? "Solo cuentan cuentas nuevas verificadas. Una cuenta puede atribuirse una sola vez." : "Only new verified accounts count. An account can be attributed once."}</small>
      </section>

      <section className="referral-board panel">
        <div className="panel-head"><div><span className="panel-kicker">TOP 10</span><h2>{es ? "Coleccionistas que más han crecido la comunidad" : "Collectors growing the community"}</h2></div></div>
        <div className="referral-list">
          {data?.leaderboard.length ? data.leaderboard.map((entry) => <div key={`${entry.position}-${entry.name}`}><b>#{entry.position}</b><strong>{entry.name}</strong><span>{entry.count} {entry.count === 1 ? (es ? "referido" : "referral") : (es ? "referidos" : "referrals")}</span></div>) : <p>{es ? "Sé la primera persona en el ranking." : "Be the first person on the leaderboard."}</p>}
        </div>
      </section>
    </main>
  );
}
