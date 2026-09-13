"use client";

/* eslint-disable @next/next/no-img-element */

import {
  ArrowLeft,
  ArrowRight,
  BrainCircuit,
  Clock3,
  LoaderCircle,
  MessageCircleQuestion,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { LanguageToggle, useLanguage } from "@/components/language-provider";
import { AuthControl } from "@/components/auth-control";
import { MagicBrainLogo } from "@/components/brand-logo";
import { formatCurrency } from "@/lib/data";

type Analysis = {
  answer: string;
  card: {
    id: string;
    name: string;
    setCode: string;
    setName: string;
    collectorNumber: string;
    imageUrl: string | null;
  };
  metrics: {
    risePercent: number;
    riseDays: number;
    riseStart: { date: string; price: number };
    riseEnd: { date: string; price: number };
    biggestChangeDate: string;
    biggestChangePercent: number;
    first: { date: string; price: number };
    latest: { date: string; price: number };
    totalReturn: number;
  };
  history: Array<{ date: string; price: number }>;
};

function AnalysisChart({ points }: { points: Analysis["history"] }) {
  if (points.length < 2) return null;
  const width = 800;
  const height = 210;
  const min = Math.min(...points.map((point) => point.price));
  const max = Math.max(...points.map((point) => point.price));
  const line = points
    .map(
      (point, index) =>
        `${(index / (points.length - 1)) * width},${
          height -
          ((point.price - min) / Math.max(max - min, 0.01)) * (height - 14) -
          7
        }`,
    )
    .join(" ");
  return (
    <div className="analyst-chart">
      <div className="analyst-chart-scale">
        <span>{formatCurrency(max)}</span><span>{formatCurrency(min)}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="analystFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#48b9ff" stopOpacity=".3" />
            <stop offset="1" stopColor="#48b9ff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={`0,${height} ${line} ${width},${height}`} fill="url(#analystFill)" />
        <polyline points={line} fill="none" stroke="#48b9ff" strokeWidth="3" vectorEffect="non-scaling-stroke" />
      </svg>
      <div><span>{points[0].date}</span><span>{points.at(-1)?.date}</span></div>
    </div>
  );
}

export default function AnalystPage() {
  const { locale, t } = useLanguage();
  const [question, setQuestion] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const ask = async (
    event?: FormEvent<HTMLFormElement>,
    suggestedQuestion?: string,
  ) => {
    event?.preventDefault();
    const nextQuestion = suggestedQuestion ?? question;
    if (!nextQuestion.trim()) return;
    setQuestion(nextQuestion);
    setLoading(true);
    setError("");
    const response = await fetch("/api/analyst", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: nextQuestion, locale }),
    });
    const result = await response.json();
    if (response.ok) setAnalysis(result as Analysis);
    else setError(result.error ?? "Unable to answer this question");
    setLoading(false);
  };

  const suggestions =
    locale === "es"
      ? [
          "¿En cuánto tiempo subió de precio The One Ring?",
          "¿Cuándo fue el mayor cambio de Black Lotus?",
          "¿Cuánto ha cambiado Rhystic Study?",
        ]
      : [
          "How long did The One Ring take to rise?",
          "When was Black Lotus's largest price move?",
          "How much has Rhystic Study changed?",
        ];

  return (
    <main className="account-page analyst-page">
      <header className="account-topbar">
        <Link href="/" className="inventory-brand"><MagicBrainLogo /></Link>
        <nav><Link href="/signals">Brain Signals</Link><Link href="/market">{t("Market")}</Link><Link href="/brain-pro">Brain Pro</Link></nav>
        <LanguageToggle />
        <AuthControl compact />
        <Link href="/" className="back-dashboard"><ArrowLeft size={15} /> {t("Dashboard")}</Link>
      </header>

      <div className="analyst-content">
        <div className="analyst-hero">
          <span className="analyst-icon"><MessageCircleQuestion size={28} /></span>
          <span className="eyebrow premium-feature-badge"><Sparkles size={12} /> Ask Brain · Pro {locale === "es" ? "gratis" : "free"}</span>
          <h1>{locale === "es" ? "Pregunta a tus datos." : "Ask your market data."}</h1>
          <p>{locale === "es" ? "Consulta subidas, fechas clave y movimientos diarios usando todo el historial de precios." : "Ask about rises, key dates, and daily movements using the complete price history."}</p>
          <form onSubmit={ask}>
            <Sparkles size={18} />
            <input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={locale === "es" ? "Ej. ¿Cuándo tuvo The One Ring su mayor subida?" : "E.g. When did The One Ring have its largest rise?"} />
            <button disabled={loading || !question.trim()}>{loading ? <LoaderCircle className="spin" size={17} /> : <ArrowRight size={17} />}</button>
          </form>
          <div className="analyst-suggestions">
            {suggestions.map((suggestion) => <button key={suggestion} onClick={() => ask(undefined, suggestion)}>{suggestion}</button>)}
          </div>
        </div>

        {error && <div className="analyst-error">{error}</div>}
        {analysis && (
          <section className="analyst-result fintech-panel">
            <div className="analyst-card-head">
              {analysis.card.imageUrl && <img src={analysis.card.imageUrl} alt="" />}
              <div><span className="eyebrow">{analysis.card.setName}</span><h2>{analysis.card.name}</h2><p>{analysis.card.setCode.toUpperCase()} · #{analysis.card.collectorNumber}</p></div>
              <Link href={`/portfolio?cardId=${analysis.card.id}`}>{locale === "es" ? "Añadir a cartera" : "Add to portfolio"} <ArrowRight size={13} /></Link>
            </div>
            <div className="analyst-answer"><BrainCircuit size={19} /><p>{analysis.answer}</p></div>
            <div className="analyst-metrics">
              <div><TrendingUp size={16} /><span>{locale === "es" ? "Mayor subida" : "Strongest rise"}</span><strong>+{analysis.metrics.risePercent.toFixed(1)}%</strong></div>
              <div><Clock3 size={16} /><span>{locale === "es" ? "Duración" : "Time to rise"}</span><strong>{analysis.metrics.riseDays} {locale === "es" ? "días" : "days"}</strong></div>
              <div><Zap size={16} /><span>{locale === "es" ? "Mayor cambio diario" : "Largest daily move"}</span><strong className={analysis.metrics.biggestChangePercent >= 0 ? "up" : "down"}>{analysis.metrics.biggestChangePercent >= 0 ? "+" : ""}{analysis.metrics.biggestChangePercent.toFixed(1)}%</strong></div>
            </div>
            <AnalysisChart points={analysis.history} />
          </section>
        )}
      </div>
    </main>
  );
}
