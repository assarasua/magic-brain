import {
  ArrowUpRight,
  BrainCircuit,
  Heart,
  MessageCircleQuestion,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";

export type ProFeature = "brain" | "analyst" | "signals" | "discover" | "predict";

export function ProFeaturePreview({
  feature,
  locale,
  compact = false,
}: {
  feature: ProFeature;
  locale: "en" | "es";
  compact?: boolean;
}) {
  const es = locale === "es";
  const label = es ? "Vista previa del producto" : "Product preview";

  return (
    <div className={`pro-product-preview ${compact ? "compact" : ""}`} aria-label={`${label}: ${feature}`}>
      <div className="pro-preview-chrome">
        <span><i /><i /><i /></span>
        <small>{label}</small>
        <b>MAGIC BRAIN</b>
      </div>

      {feature === "brain" && (
        <div className="pro-preview-builder">
          <div className="pro-preview-side">
            <span><BrainCircuit size={13} /> {es ? "Tu estrategia" : "Your strategy"}</span>
            <label>{es ? "Presupuesto" : "Budget"}<strong>€2,500</strong></label>
            <label>{es ? "Riesgo" : "Risk"}<i><b /></i><small>{es ? "Equilibrado" : "Balanced"}</small></label>
            <button type="button"><Sparkles size={11} /> {es ? "Generar cartera" : "Generate portfolio"}</button>
          </div>
          <div className="pro-preview-main">
            <header><span>{es ? "CARTERA PROPUESTA" : "PROPOSED PORTFOLIO"}</span><b>8 {es ? "posiciones" : "positions"}</b></header>
            {[["The One Ring", "24%"], ["Reserved List", "19%"], ["Modern staples", "15%"]].map(([name, value], index) => (
              <div className="pro-preview-position" key={name}>
                <i>{index + 1}</i><span><b>{name}</b><small>{es ? "Tesis + guía de compra" : "Thesis + buyer guidance"}</small></span><strong>{value}</strong>
              </div>
            ))}
          </div>
        </div>
      )}

      {feature === "signals" && (
        <div className="pro-preview-signals">
          <div className="pro-preview-kpis">
            <span><small>{es ? "RÉGIMEN" : "REGIME"}</small><strong>{es ? "Selectivo" : "Selective"}</strong><b>64/100</b></span>
            <span><small>{es ? "AMPLITUD" : "BREADTH"}</small><strong>58.4%</strong><b className="up">+8.4</b></span>
            <span><small>{es ? "RIESGO" : "RISK"}</small><strong>{es ? "Moderado" : "Moderate"}</strong><b>30D</b></span>
          </div>
          <div className="pro-preview-chart">
            <header><span>{es ? "ÍNDICE MAGIC BRAIN" : "MAGIC BRAIN INDEX"}</span><b><TrendingUp size={11} /> +6.8%</b></header>
            <svg viewBox="0 0 500 112" preserveAspectRatio="none" role="img" aria-label={es ? "Gráfico de tendencia de mercado de ejemplo" : "Sample market trend chart"}>
              <defs><linearGradient id={`preview-fill-${compact ? "compact" : "full"}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f2c66d" stopOpacity=".28" /><stop offset="1" stopColor="#f2c66d" stopOpacity="0" /></linearGradient></defs>
              <path d="M0 92 L52 82 L105 88 L158 62 L210 69 L263 45 L316 52 L368 31 L421 38 L500 15 L500 112 L0 112 Z" fill={`url(#preview-fill-${compact ? "compact" : "full"})`} />
              <polyline points="0,92 52,82 105,88 158,62 210,69 263,45 316,52 368,31 421,38 500,15" />
            </svg>
            <footer><span>{es ? "Zona de vigilancia" : "Watch zone"} <b>≤ €42.80</b></span><span>{es ? "Puntuación" : "Signal score"} <b>82/100</b></span></footer>
          </div>
        </div>
      )}

      {feature === "analyst" && (
        <div className="pro-preview-analyst">
          <div className="pro-preview-question"><MessageCircleQuestion size={15} /><span>{es ? "¿Cuándo tuvo su mayor subida?" : "When did it have its largest rise?"}</span><ArrowUpRight size={13} /></div>
          <div className="pro-preview-answer">
            <span><Sparkles size={13} /> BRAIN ANALYSIS</span>
            <p>{es ? "El mayor movimiento ocurrió durante una ventana de 12 días, con una subida del 18,4%." : "The strongest move occurred across a 12-day window, rising 18.4%."}</p>
            <div><span><small>{es ? "MAYOR SUBIDA" : "STRONGEST RISE"}</small><b>+18.4%</b></span><span><small>{es ? "DURACIÓN" : "DURATION"}</small><b>12 {es ? "días" : "days"}</b></span><span><small>{es ? "DATOS" : "DATA"}</small><b>{es ? "Histórico" : "History"}</b></span></div>
          </div>
        </div>
      )}

      {feature === "discover" && (
        <div className="pro-preview-discover">
          <div className="pro-preview-card">
            <div className="pro-preview-card-art"><Sparkles size={28} /><span>MAGIC BRAIN</span></div>
            <div>
              <span className="pro-preview-match">92% {es ? "compatible" : "match"}</span>
              <strong>{es ? "Oportunidad seleccionada" : "Matched opportunity"}</strong>
              <small>{es ? "Afinidad, precio y tendencia explicados" : "Profile fit, price, and trend explained"}</small>
              <div><b>€38.20</b><em><TrendingUp size={10} /> +7.3%</em></div>
            </div>
          </div>
          <div className="pro-preview-decisions"><span>× <small>{es ? "Pasar" : "Pass"}</small></span><span><Heart size={15} /> <small>{es ? "Guardar" : "Save"}</small></span></div>
        </div>
      )}

      {feature === "predict" && (
        <div className="pro-preview-signals">
          <div className="pro-preview-kpis">
            <span><small>{es ? "OBJETIVO" : "TARGET"}</small><strong>S&amp;P 500</strong><b>8% / yr</b></span>
            <span><small>{es ? "PUNTUACIÓN" : "SCORE"}</small><strong>72/100</strong><b className="up">{es ? "Vigilar" : "Watch"}</b></span>
            <span><small>{es ? "CONFIANZA" : "CONFIDENCE"}</small><strong>61%</strong><b>24M</b></span>
          </div>
          <div className="pro-preview-chart">
            <header><span><Target size={11} /> {es ? "RANGO DE ESCENARIO" : "SCENARIO RANGE"}</span><b>-12% → +34%</b></header>
            <svg viewBox="0 0 500 112" preserveAspectRatio="none" role="img" aria-label={es ? "Rango de predicción de ejemplo" : "Sample prediction range"}>
              <path d="M0 82 C100 76 160 65 240 58 C320 49 398 30 500 18 L500 84 C410 86 332 76 240 74 C150 75 72 88 0 95 Z" fill="rgba(242,198,109,.18)" />
              <polyline points="0,88 120,78 240,66 360,48 500,28" />
            </svg>
            <footer><span>{es ? "Bajista" : "Bear"} <b>-12%</b></span><span>{es ? "Alcista" : "Bull"} <b>+34%</b></span></footer>
          </div>
        </div>
      )}
    </div>
  );
}
