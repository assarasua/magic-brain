"use client";

/* eslint-disable @next/next/no-img-element */

import {
  Bell,
  BrainCircuit,
  Check,
  Copy,
  Eye,
  FolderInput,
  ImageOff,
  Pencil,
  Plus,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useCardDetail } from "@/components/card-detail-provider";
import { MlInsight } from "@/components/ml-insight";
import type { MlCardContext, MlRankingStatus } from "@/lib/ml-experience";
import type { PortfolioHolding, PortfolioList } from "@/lib/portfolio";
import { formatCurrency } from "@/lib/data";
import styles from "./portfolio-decision-section.module.css";

type Locale = "en" | "es";

export type DecisionCandidate = {
  id: string;
  name: string;
  setCode: string;
  setName?: string;
  collectorNumber?: string;
  imageUrl: string | null;
  price: number;
  priceDate?: string | null;
  change7d: number | null;
  change30d?: number | null;
  ml?: MlCardContext | null;
};

export type DecisionHolding = PortfolioHolding & {
  ml?: MlCardContext | null;
  reviewSignal: "cooling";
};

export type PortfolioDecisionData = {
  ranking: MlRankingStatus;
  mode: "ml" | "deterministic";
  state: "no_portfolio" | "no_priced_holdings" | "active";
  candidateState:
    | "available"
    | "no_candidates_after_constraints"
    | "portfolio_unavailable";
  candidateAdditions: DecisionCandidate[];
  holdingReviews: DecisionHolding[];
  coverage?: {
    pricedHoldings: number;
    totalHoldings: number;
    momentumHoldings: number;
  };
  thresholds?: {
    minimumCandidatePrice: number;
    maximumCandidatePrice: number;
    cooling7dPercent: number;
    cooling30dPercent: number;
  };
};

const movement = (value: number | null | undefined) =>
  value == null ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;

const freshness = (date: string | null | undefined, locale: Locale) => {
  if (!date) return locale === "es" ? "Fecha no disponible" : "Date unavailable";
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
  }).format(new Date(`${date.slice(0, 10)}T12:00:00Z`));
};

function CardArtwork({
  imageUrl,
  name,
  locale,
}: {
  imageUrl: string | null;
  name: string;
  locale: Locale;
}) {
  return (
    <div className={styles.artwork}>
      <span aria-hidden="true"><ImageOff size={22} /></span>
      {imageUrl && (
        <img
          src={imageUrl}
          alt={`${name} ${locale === "es" ? "imagen de la carta" : "card artwork"}`}
          loading="lazy"
          onError={(event) => {
            event.currentTarget.hidden = true;
          }}
        />
      )}
    </div>
  );
}

function Movement({
  label,
  value,
}: {
  label: string;
  value: number | null | undefined;
}) {
  const positive = value != null && value >= 0;
  return (
    <div className={styles.metric}>
      <span>{label}</span>
      <strong data-tone={value == null ? "neutral" : positive ? "positive" : "negative"}>
        {value == null ? null : positive ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
        {movement(value)}
      </strong>
    </div>
  );
}

function EmptyDecisionState({
  kind,
  locale,
  data,
}: {
  kind: "candidates" | "holdings";
  locale: Locale;
  data: PortfolioDecisionData;
}) {
  const es = locale === "es";
  const thresholds = data.thresholds;
  let title = es ? "Aún no hay una revisión útil" : "No useful review yet";
  let copy = es
    ? "Ninguna carta cruza los umbrales de enfriamiento actuales."
    : "No cards cross the current cooling thresholds.";

  if (data.state === "no_portfolio") {
    title = es ? "Tu colección aún no tiene cartas" : "Your collection has no cards yet";
    copy = es
      ? "Añade una carta para obtener contexto de precio, contribución y movimiento."
      : "Add a card to unlock price, contribution, and movement context.";
  } else if (data.state === "no_priced_holdings") {
    title = es ? "Faltan precios actuales" : "Current prices are missing";
    copy = es
      ? "Las cartas están registradas, pero no podemos calcular movimiento ni contribución hasta tener precios."
      : "Your cards are recorded, but movement and contribution cannot be calculated until prices are available.";
  } else if (kind === "candidates") {
    title = es ? "Ninguna candidata pasa las reglas" : "No candidates pass the rules";
    copy = es
      ? `Se exige momentum 7D positivo y un precio entre ${formatCurrency(thresholds?.minimumCandidatePrice ?? 2)} y ${formatCurrency(thresholds?.maximumCandidatePrice ?? 0)}.`
      : `Candidates need positive 7D momentum and a price from ${formatCurrency(thresholds?.minimumCandidatePrice ?? 2)} to ${formatCurrency(thresholds?.maximumCandidatePrice ?? 0)}.`;
  } else {
    copy = es
      ? `0 posiciones caen al menos ${Math.abs(thresholds?.cooling7dPercent ?? -2)}% en 7D o ${Math.abs(thresholds?.cooling30dPercent ?? -5)}% en 30D.`
      : `0 holdings are down at least ${Math.abs(thresholds?.cooling7dPercent ?? -2)}% over 7D or ${Math.abs(thresholds?.cooling30dPercent ?? -5)}% over 30D.`;
  }

  return (
    <div className={styles.empty}>
      <strong>{title}</strong>
      <p>{copy}</p>
      <div>
        <Link href="/signals">{es ? "Ver señales" : "View Signals"}</Link>
        <Link href="/discover">{es ? "Explorar cartas" : "Discover cards"}</Link>
      </div>
    </div>
  );
}

export function PortfolioDecisionSection({
  locale,
  data,
  lists,
  activeListId,
  portfolioValue,
  selectedHoldingIds,
  loading = false,
  error = false,
  onAddCandidate,
  onWatchCandidate,
  onEditHolding,
  onManageHolding,
  onToggleHolding,
}: {
  locale: Locale;
  data: PortfolioDecisionData;
  lists: PortfolioList[];
  activeListId: string;
  portfolioValue: number;
  selectedHoldingIds: number[];
  loading?: boolean;
  error?: boolean;
  onAddCandidate: (candidate: DecisionCandidate, rank: number, listId: string) => void;
  onWatchCandidate: (candidate: DecisionCandidate) => void;
  onEditHolding: (holding: DecisionHolding) => void;
  onManageHolding: (holding: DecisionHolding, action: "move" | "copy") => void;
  onToggleHolding: (holdingId: number) => void;
}) {
  const { cardSurfaceProps, openCard } = useCardDetail();
  const es = locale === "es";
  const [destinations, setDestinations] = useState<Record<string, string>>({});
  const verifiedMl =
    data.mode === "ml" &&
    data.ranking.source === "ml_batch" &&
    Boolean(data.ranking.modelVersion && data.ranking.scoreDate);

  if (loading) {
    return (
      <section className={styles.panel} aria-busy="true" aria-label={es ? "Cargando contexto de la colección" : "Loading collection context"}>
        <div className={styles.skeletonHead} />
        <div className={styles.skeletonGrid}>
          {Array.from({ length: 4 }, (_, index) => <div className={styles.skeletonCard} key={index} />)}
        </div>
      </section>
    );
  }

  return (
    <section className={styles.panel} aria-labelledby="portfolio-decisions-title">
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>{es ? "CONTEXTO DE LA COLECCIÓN" : "COLLECTION CONTEXT"}</span>
          <h2 id="portfolio-decisions-title">{es ? "Cartas que merece la pena revisar" : "Cards worth another look"}</h2>
          <p>{es ? "Contexto para revisar; tú decides y confirmas cada acción." : "Context to review; you decide and confirm every action."}</p>
        </div>
        <span className={styles.method} data-ml={verifiedMl}>
          <BrainCircuit size={14} />
          {verifiedMl
            ? es ? "ML verificado" : "Verified ML"
            : es ? "Reglas transparentes" : "Transparent rules"}
        </span>
      </header>

      {error ? (
        <div className={styles.error} role="alert">
          <strong>{es ? "No pudimos cargar las decisiones" : "We couldn’t load decisions"}</strong>
          <span>{es ? "Tu colección no ha cambiado. Actualiza la página para reintentar." : "Your collection is unchanged. Refresh the page to try again."}</span>
        </div>
      ) : (
        <>
          <div className={styles.methodology}>
            <span>
              {verifiedMl
                ? `${es ? "Modelo" : "Model"} ${data.ranking.modelVersion} · ${es ? "datos" : "data"} ${freshness(data.ranking.scoreDate, locale)}`
                : es
                  ? "Fallback activo: precio asequible + momentum 7D positivo; sin puntuación aprendida reciente."
                  : "Fallback active: affordable price + positive 7D momentum; no recent learned score."}
            </span>
            {data.coverage && (
              <span>
                {data.coverage.pricedHoldings}/{data.coverage.totalHoldings} {es ? "con precio" : "priced"} · {data.coverage.momentumHoldings} {es ? "con movimiento comparable" : "with comparable movement"}
              </span>
            )}
          </div>

          <div className={styles.grid}>
            <div className={styles.lane}>
              <div className={styles.laneTitle}>
                <div>
                  <span>{es ? "PARA CONSIDERAR" : "TO CONSIDER"}</span>
                  <h3>{verifiedMl ? (es ? "Candidatas personalizadas" : "Personalised candidates") : (es ? "Candidatas por reglas" : "Rule-based candidates")}</h3>
                </div>
                <strong>{data.candidateAdditions.length}</strong>
              </div>
              <div className={styles.cards}>
                {data.candidateAdditions.length ? data.candidateAdditions.map((candidate, index) => {
                  const destination = destinations[candidate.id] || activeListId;
                  const hasVerifiedContext = verifiedMl && Boolean(candidate.ml);
                  return (
                    <article
                      key={candidate.id}
                      className={styles.card}
                      {...cardSurfaceProps(candidate.id)}
                    >
                      <div className={styles.top}>
                        <CardArtwork imageUrl={candidate.imageUrl} name={candidate.name} locale={locale} />
                        <div className={styles.identity}>
                          <div className={styles.badges}>
                            <span data-tone="candidate">{es ? "Candidata" : "Candidate"}</span>
                            {hasVerifiedContext && <span data-tone="ml"><Check size={11} /> {es ? "ML verificado" : "Verified ML"}</span>}
                          </div>
                          <h4>{candidate.name}</h4>
                          <p>{candidate.setName ?? candidate.setCode.toUpperCase()} · {candidate.setCode.toUpperCase()}{candidate.collectorNumber ? ` #${candidate.collectorNumber}` : ""}</p>
                          <strong className={styles.price}>{formatCurrency(candidate.price)}</strong>
                        </div>
                      </div>
                      <div className={styles.metrics}>
                        <Movement label="7D" value={candidate.change7d} />
                        <Movement label="30D" value={candidate.change30d} />
                        <div className={styles.metric}>
                          <span>{es ? "Actualizado" : "Updated"}</span>
                          <strong data-tone="neutral">{freshness(candidate.priceDate, locale)}</strong>
                        </div>
                      </div>
                      <p className={styles.reason}>
                        {hasVerifiedContext
                          ? es
                            ? `Revisar: señal personalizada con ${Math.round((candidate.ml?.confidence ?? 0) * 100)}% de confianza; confirma encaje y riesgo antes de añadir.`
                            : `Review: personalised signal at ${Math.round((candidate.ml?.confidence ?? 0) * 100)}% confidence; confirm fit and risk before adding.`
                          : es
                            ? `Por qué revisarla: cuesta menos de ${formatCurrency(data.thresholds?.maximumCandidatePrice ?? candidate.price)} y sube ${movement(candidate.change7d)} en 7D.`
                            : `Why review: priced below ${formatCurrency(data.thresholds?.maximumCandidatePrice ?? candidate.price)} and up ${movement(candidate.change7d)} over 7D.`}
                      </p>
                      {hasVerifiedContext && candidate.ml && (
                        <MlInsight
                          locale={locale}
                          ranking={data.ranking}
                          context={candidate.ml}
                          surface="portfolio"
                          cardId={candidate.id}
                          rankPosition={index + 1}
                        />
                      )}
                      <div className={styles.actions}>
                        <button type="button" onClick={() => openCard(candidate.id)}>
                          <Eye size={14} /> {es ? "Detalles" : "Details"}
                        </button>
                        <label>
                          <span className="sr-only">{es ? `Lista para ${candidate.name}` : `List for ${candidate.name}`}</span>
                          <select
                            value={destination}
                            onChange={(event) => setDestinations((current) => ({ ...current, [candidate.id]: event.target.value }))}
                            aria-label={es ? `Añadir ${candidate.name} a la lista` : `Add ${candidate.name} to list`}
                          >
                            {lists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}
                          </select>
                        </label>
                        <button type="button" className={styles.primaryAction} onClick={() => onAddCandidate(candidate, index + 1, destination)}>
                          <Plus size={14} /> {es ? "Añadir" : "Add"}
                        </button>
                        <button type="button" onClick={() => onWatchCandidate(candidate)}>
                          <Bell size={14} /> {es ? "Seguir" : "Watch"}
                        </button>
                      </div>
                    </article>
                  );
                }) : <EmptyDecisionState kind="candidates" locale={locale} data={data} />}
              </div>
            </div>

            <div className={styles.lane}>
              <div className={styles.laneTitle}>
                <div>
                  <span>{es ? "EN TU COLECCIÓN" : "IN YOUR COLLECTION"}</span>
                  <h3>{es ? "Cartas con movimiento a la baja" : "Cards moving lower"}</h3>
                </div>
                <strong>{data.holdingReviews.length}</strong>
              </div>
              <div className={styles.cards}>
                {data.holdingReviews.length ? data.holdingReviews.map((holding) => (
                  <article
                    key={holding.id}
                    className={styles.card}
                    data-selected={selectedHoldingIds.includes(holding.id)}
                    {...cardSurfaceProps(holding.cardId)}
                  >
                    <div className={styles.top}>
                      <CardArtwork imageUrl={holding.imageUrl} name={holding.name} locale={locale} />
                      <div className={styles.identity}>
                        <div className={styles.badges}>
                          <span data-tone="cooling"><TrendingDown size={11} /> {es ? "Enfriándose" : "Cooling"}</span>
                          <span>{holding.quantity}× {es ? "en tu colección" : "owned"}</span>
                        </div>
                        <h4>{holding.name}</h4>
                        <p>{holding.setName} · {holding.setCode.toUpperCase()} #{holding.collectorNumber}</p>
                        <strong className={styles.price}>{holding.currentPrice === null ? "—" : formatCurrency(holding.currentPrice)}</strong>
                      </div>
                    </div>
                    <div className={styles.metrics}>
                      <Movement label="7D" value={holding.change7d} />
                      <Movement label="30D" value={holding.change30d} />
                      <div className={styles.metric}>
                        <span>{es ? "P&L no realizado" : "Unrealized P&L"}</span>
                        <strong data-tone={holding.gain === null ? "neutral" : holding.gain >= 0 ? "positive" : "negative"}>
                          {holding.gain === null ? "—" : `${holding.gain >= 0 ? "+" : ""}${formatCurrency(holding.gain)}`}
                        </strong>
                      </div>
                      <div className={styles.metric}>
                        <span>{es ? "Contribución" : "Contribution"}</span>
                        <strong data-tone={holding.currentValue === null ? "neutral" : "default"}>
                          {holding.currentValue === null ? "—" : formatCurrency(holding.currentValue)}
                          {holding.currentValue !== null && portfolioValue > 0
                            ? ` · ${((holding.currentValue / portfolioValue) * 100).toFixed(1)}%`
                            : ""}
                        </strong>
                      </div>
                    </div>
                    <p className={styles.reason}>
                      {es
                        ? `Por qué revisarla: cruza el umbral de enfriamiento (${movement(holding.change7d)} 7D; ${movement(holding.change30d)} 30D). Revisa tu tesis y datos; no es una recomendación de venta.`
                        : `Why review: crosses a cooling threshold (${movement(holding.change7d)} 7D; ${movement(holding.change30d)} 30D). Revisit your thesis and data; this is not a sell recommendation.`}
                    </p>
                    <div className={styles.freshness}>
                      {es ? "Precio" : "Price"} {freshness(holding.currentPriceDate, locale)}
                    </div>
                    <div className={styles.actions}>
                      <button type="button" onClick={() => openCard(holding.cardId)}>
                        <Eye size={14} /> {es ? "Detalles" : "Details"}
                      </button>
                      <button type="button" onClick={() => onEditHolding(holding)}>
                        <Pencil size={14} /> {es ? "Editar compra" : "Edit purchase"}
                      </button>
                      <button type="button" disabled={lists.length < 2} onClick={() => onManageHolding(holding, "move")}>
                        <FolderInput size={14} /> {es ? "Mover" : "Move"}
                      </button>
                      <button type="button" disabled={lists.length < 2} onClick={() => onManageHolding(holding, "copy")}>
                        <Copy size={14} /> {es ? "Copiar" : "Copy"}
                      </button>
                      <button
                        type="button"
                        aria-pressed={selectedHoldingIds.includes(holding.id)}
                        onClick={() => onToggleHolding(holding.id)}
                      >
                        <Check size={14} /> {selectedHoldingIds.includes(holding.id) ? (es ? "Seleccionada" : "Selected") : (es ? "Seleccionar" : "Select")}
                      </button>
                    </div>
                  </article>
                )) : <EmptyDecisionState kind="holdings" locale={locale} data={data} />}
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
