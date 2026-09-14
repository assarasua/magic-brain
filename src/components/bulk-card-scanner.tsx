"use client";

/* eslint-disable @next/next/no-img-element */

import { Camera, Check, Pause, Play, Search, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { CardLanguage } from "@/lib/card-languages";
import type { IdentifiedCatalogCard } from "@/lib/catalog";
import { createCardOcrSession, type CardOcrSession } from "@/lib/card-scan";
import { capturePerspectiveCard } from "@/lib/card-scan-capture";
import {
  adaptiveAnalysisDelay,
  analyzeCardFrame,
  BULK_SCAN_LIMIT,
  canAutoCapture,
  evaluateCapture,
  recordCapture,
  updateDeparture,
  type CardGeometry,
  type DedupeState,
  type FrameMetrics,
  type ScanGuidance,
} from "@/lib/card-scan-cv";
import {
  BoundedSerialQueue,
  enqueueBounded,
  resolveQueueItem,
  resolvedItems,
  type BulkScanItem,
} from "@/lib/card-scan-queue";
import styles from "./card-scanner-modal.module.css";

type Props = {
  locale: "en" | "es";
  language: CardLanguage;
  listId: string;
  listName: string;
  onUpload: () => void;
  onManualMode: () => void;
  onComplete: (listId: string) => Promise<void>;
};

type VideoWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (
    callback: (now: number) => void,
  ) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

const ANALYSIS_WIDTH = 160;
const ANALYSIS_HEIGHT = 224;

function guidanceCopy(guidance: ScanGuidance, locale: Props["locale"]) {
  const copy = {
    move_closer: ["Move closer", "Acerca la carta"],
    hold_steady: ["Hold steady", "Mantén la carta quieta"],
    too_dark: ["Too dark", "Demasiado oscuro"],
    glare: ["Glare detected", "Hay reflejos"],
    detected: ["Detected — capturing", "Detectada — capturando"],
  } as const;
  return copy[guidance][locale === "es" ? 1 : 0];
}

function initialItem(
  id: string,
  previewUrl: string,
  hash: string,
  confidence: number,
  language: CardLanguage,
  listId: string,
): BulkScanItem {
  return {
    id,
    previewUrl,
    hash,
    status: "queued",
    captureConfidence: confidence,
    matchConfidence: null,
    candidates: [],
    selected: null,
    quantity: 1,
    purchasePrice: null,
    condition: "near_mint",
    language,
    listId,
    acquiredAt: new Date().toISOString().slice(0, 10),
    duplicateWarning: false,
  };
}

export function BulkCardScanner({
  locale,
  language,
  listId,
  listName,
  onUpload,
  onManualMode,
  onComplete,
}: Props) {
  const [cameraReady, setCameraReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const [guidance, setGuidance] = useState<ScanGuidance>("move_closer");
  const [queue, setQueue] = useState<BulkScanItem[]>([]);
  const [message, setMessage] = useState("");
  const [analysisDelay, setAnalysisDelay] = useState(140);
  const [saving, setSaving] = useState(false);
  const [manualItemId, setManualItemId] = useState<string | null>(null);
  const [manualQuery, setManualQuery] = useState("");
  const [manualResults, setManualResults] = useState<IdentifiedCatalogCard[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef<CardOcrSession | null>(null);
  const queueRef = useRef<BulkScanItem[]>([]);
  const blobsRef = useRef(new Map<string, Blob>());
  const processorRef = useRef<BoundedSerialQueue<string> | null>(null);
  const activeRef = useRef(true);
  const pausedRef = useRef(false);
  const captureLockRef = useRef(false);
  const metricsRef = useRef<FrameMetrics[]>([]);
  const geometryRef = useRef<CardGeometry | null>(null);
  const previousLumaRef = useRef<Uint8Array | undefined>(undefined);
  const delayRef = useRef(140);
  const lastAnalysisRef = useRef(0);
  const dedupeRef = useRef<DedupeState>({
    lastHash: null,
    lastCapturedAt: 0,
    departedFrames: 3,
  });
  const idempotencyRef = useRef(crypto.randomUUID());

  const replaceQueue = (
    update: BulkScanItem[] | ((items: BulkScanItem[]) => BulkScanItem[]),
  ) => {
    const next =
      typeof update === "function" ? update(queueRef.current) : update;
    queueRef.current = next;
    setQueue(next);
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const startCamera = async () => {
    setMessage("");
    setCameraReady(false);
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage(
        locale === "es"
          ? "Este navegador no admite análisis de cámara. Usa captura manual o sube una foto."
          : "This browser cannot analyze a camera stream. Use manual capture or upload a photo.",
      );
      return;
    }
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      } catch (error) {
        if (
          error instanceof DOMException &&
          (error.name === "NotAllowedError" || error.name === "SecurityError")
        ) {
          throw error;
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }
      if (!activeRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error("video_unavailable");
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();
      if (video.videoWidth > 0) setCameraReady(true);
    } catch {
      setMessage(
        locale === "es"
          ? "No se pudo abrir la cámara. La captura manual y la subida siguen disponibles."
          : "The camera could not open. Manual capture and upload remain available.",
      );
    }
  };

  const updateItem = (id: string, patch: Partial<BulkScanItem>) => {
    replaceQueue((items) =>
      items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  };

  const processCapturedItem = async (id: string) => {
    if (!activeRef.current) return;
    const blob = blobsRef.current.get(id);
    if (!blob) return;
    updateItem(id, { status: "processing" });
    try {
      const session = sessionRef.current;
      if (!session) throw new Error("ocr_not_ready");
      const result = await session.recognize(blob);
      const response = await fetch("/api/cards/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: result.text,
          language: result.language,
          setCode: result.setCode,
          collectorNumber: result.collectorNumber,
        }),
      });
      const payload = (await response.json()) as {
        candidates?: IdentifiedCatalogCard[];
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "identify_failed");
      const before = queueRef.current.find((item) => item.id === id);
      const next = resolveQueueItem(queueRef.current, id, payload.candidates ?? []);
      replaceQueue(next);
      if (before && !next.some((item) => item.id === id)) {
        URL.revokeObjectURL(before.previewUrl);
      }
    } catch {
      updateItem(id, {
        status: "error",
        error:
          locale === "es"
            ? "No se pudo identificar. Selecciona una impresión manualmente."
            : "Could not identify. Select a printing manually.",
      });
    } finally {
      blobsRef.current.delete(id);
    }
  };

  const enqueueCapture = async (
    geometry: CardGeometry,
    hash: string,
    confidence: number,
  ) => {
    if (captureLockRef.current || queueRef.current.length >= BULK_SCAN_LIMIT) return;
    captureLockRef.current = true;
    try {
      const video = videoRef.current;
      if (!video) return;
      const blob = await capturePerspectiveCard(video, geometry);
      const id = crypto.randomUUID();
      const previewUrl = URL.createObjectURL(blob);
      const result = enqueueBounded(
        queueRef.current,
        initialItem(id, previewUrl, hash, confidence, language, listId),
      );
      if (!result.accepted) {
        URL.revokeObjectURL(previewUrl);
        setMessage(
          locale === "es"
            ? "La cola está llena. Revisa o añade las cartas antes de continuar."
            : "The queue is full. Review or add cards before continuing.",
        );
        return;
      }
      replaceQueue(result.items);
      blobsRef.current.set(id, blob);
      if (!processorRef.current?.push(id)) {
        updateItem(id, {
          status: "error",
          error: locale === "es" ? "La cola de OCR está llena." : "The OCR queue is full.",
        });
      }
    } finally {
      window.setTimeout(() => {
        captureLockRef.current = false;
      }, 250);
    }
  };

  useEffect(() => {
    activeRef.current = true;
    const session = createCardOcrSession(language);
    const blobs = blobsRef.current;
    sessionRef.current = session;
    processorRef.current = new BoundedSerialQueue(processCapturedItem);
    void session.prewarm().catch(() => undefined);
    const cameraTimer = window.setTimeout(() => void startCamera(), 0);
    return () => {
      activeRef.current = false;
      window.clearTimeout(cameraTimer);
      stopCamera();
      void session.terminate();
      queueRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      blobs.clear();
    };
    // The selected language is fixed while this scanner instance is mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  useEffect(() => {
    const video = videoRef.current as VideoWithFrameCallback | null;
    if (!video || !cameraReady) return;
    const canvas = document.createElement("canvas");
    canvas.width = ANALYSIS_WIDTH;
    canvas.height = ANALYSIS_HEIGHT;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    let cancelled = false;
    let frameHandle = 0;
    let animationHandle = 0;

    const analyze = (now: number) => {
      if (
        cancelled ||
        pausedRef.current ||
        captureLockRef.current ||
        now - lastAnalysisRef.current < delayRef.current
      ) {
        return;
      }
      lastAnalysisRef.current = now;
      const started = performance.now();
      context.drawImage(video, 0, 0, ANALYSIS_WIDTH, ANALYSIS_HEIGHT);
      const image = context.getImageData(0, 0, ANALYSIS_WIDTH, ANALYSIS_HEIGHT);
      const { metrics, luma } = analyzeCardFrame(
        image.data,
        ANALYSIS_WIDTH,
        ANALYSIS_HEIGHT,
        previousLumaRef.current,
      );
      previousLumaRef.current = luma;
      geometryRef.current = metrics.geometry;
      metricsRef.current = [...metricsRef.current.slice(-5), metrics];
      dedupeRef.current = updateDeparture(dedupeRef.current, Boolean(metrics.geometry));
      const decision = evaluateCapture(metricsRef.current);
      if (process.env.NODE_ENV !== "production") {
        (
          window as typeof window & {
            __bulkScanDebug?: unknown;
          }
        ).__bulkScanDebug = {
          metrics,
          decision,
          dedupe: dedupeRef.current,
          queueLength: queueRef.current.length,
        };
      }
      setGuidance(decision.guidance);
      const nextDelay = adaptiveAnalysisDelay(performance.now() - started, delayRef.current);
      if (nextDelay !== delayRef.current) {
        delayRef.current = nextDelay;
        setAnalysisDelay(nextDelay);
      }
      if (
        decision.ready &&
        metrics.geometry &&
        canAutoCapture(dedupeRef.current, metrics.hash, Date.now())
      ) {
        dedupeRef.current = recordCapture(dedupeRef.current, metrics.hash, Date.now());
        metricsRef.current = [];
        void enqueueCapture(metrics.geometry, metrics.hash, decision.confidence);
      }
    };
    const frameLoop = (now: number) => {
      analyze(now);
      if (!cancelled) {
        frameHandle = video.requestVideoFrameCallback?.(frameLoop) ?? 0;
      }
    };
    const animationLoop = (now: number) => {
      analyze(now);
      if (!cancelled) animationHandle = requestAnimationFrame(animationLoop);
    };
    if (video.requestVideoFrameCallback) {
      frameHandle = video.requestVideoFrameCallback(frameLoop);
    } else {
      animationHandle = requestAnimationFrame(animationLoop);
    }
    return () => {
      cancelled = true;
      if (frameHandle) video.cancelVideoFrameCallback?.(frameHandle);
      if (animationHandle) cancelAnimationFrame(animationHandle);
    };
    // enqueueCapture uses refs for current queue state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraReady]);

  useEffect(() => {
    if (!manualItemId || manualQuery.trim().length < 2) {
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/cards/search?q=${encodeURIComponent(manualQuery)}`, {
        signal: controller.signal,
      })
        .then((response) => response.json())
        .then((payload: { cards?: IdentifiedCatalogCard[] }) =>
          setManualResults(payload.cards ?? []),
        )
        .catch(() => setManualResults([]));
    }, 220);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [manualItemId, manualQuery]);

  const removeItem = (id: string) => {
    const item = queueRef.current.find((candidate) => candidate.id === id);
    if (item) URL.revokeObjectURL(item.previewUrl);
    blobsRef.current.delete(id);
    replaceQueue((items) => items.filter((candidate) => candidate.id !== id));
  };

  const addBatch = async () => {
    const ready = resolvedItems(queueRef.current);
    if (saving || ready.length === 0) return;
    setSaving(true);
    setMessage("");
    ready.forEach((item) => updateItem(item.id, { status: "adding" }));
    try {
      const response = await fetch("/api/portfolio/batch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyRef.current,
        },
        body: JSON.stringify({
          items: ready.map((item) => ({
            clientId: item.id,
            cardId: item.selected!.id,
            quantity: item.quantity,
            purchasePrice: item.purchasePrice ?? item.selected!.price ?? 0,
            condition: item.condition,
            language: item.language,
            acquiredAt: item.acquiredAt,
            listId: item.listId,
          })),
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "batch_failed");
      ready.forEach((item) => {
        URL.revokeObjectURL(item.previewUrl);
        blobsRef.current.delete(item.id);
      });
      replaceQueue((items) => items.filter((item) => !ready.some((done) => done.id === item.id)));
      idempotencyRef.current = crypto.randomUUID();
      await onComplete(listId);
      setMessage(
        locale === "es"
          ? `Se añadieron ${ready.reduce((sum, item) => sum + item.quantity, 0)} cartas.`
          : `Added ${ready.reduce((sum, item) => sum + item.quantity, 0)} cards.`,
      );
    } catch {
      ready.forEach((item) => updateItem(item.id, { status: "error" }));
      setMessage(
        locale === "es"
          ? "No se añadió ninguna carta. Corrige el error y vuelve a intentarlo."
          : "No cards were added. Fix the error and retry safely.",
      );
    } finally {
      setSaving(false);
    }
  };

  const resolved = resolvedItems(queue);
  const unresolvedCount = queue.length - resolved.length;
  const cardCount = resolved.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className={styles.bulkLayout}>
      <section className={styles.bulkCamera} aria-label={locale === "es" ? "Escáner continuo" : "Continuous scanner"}>
        <div className={styles.cameraViewport} data-ready={cameraReady}>
          <video
            ref={videoRef}
            muted
            playsInline
            autoPlay
            onLoadedMetadata={() => setCameraReady(true)}
            aria-label={locale === "es" ? "Vista de cámara para escaneo masivo" : "Bulk scan camera preview"}
          />
          <div className={styles.frame} aria-hidden="true" />
          <strong className={styles.liveGuidance} data-guidance={guidance} role="status" aria-live="polite">
            {guidanceCopy(guidance, locale)}
          </strong>
        </div>
        <div className={styles.bulkStats}>
          <span>{locale === "es" ? `${Math.round(1000 / analysisDelay)} análisis/s` : `${Math.round(1000 / analysisDelay)} analyses/s`}</span>
          <span>{queue.length}/{BULK_SCAN_LIMIT}</span>
        </div>
        {message && <p className={styles.warning} role="alert">{message}</p>}
        <div className={styles.cameraActions}>
          <button type="button" onClick={() => { pausedRef.current = !paused; setPaused(!paused); }}>
            {paused ? <Play size={16} /> : <Pause size={16} />}
            {paused ? (locale === "es" ? "Reanudar" : "Resume") : (locale === "es" ? "Pausar" : "Pause")}
          </button>
          <button type="button" onClick={onUpload}><Upload size={16} />{locale === "es" ? "Subir" : "Upload"}</button>
          <button type="button" onClick={onManualMode}><Camera size={16} />{locale === "es" ? "Manual" : "Manual"}</button>
        </div>
        <p>{locale === "es" ? "Retira cada carta antes de mostrar la siguiente. El análisis y OCR permanecen en este dispositivo." : "Remove each card before showing the next. Frame analysis and OCR stay on this device."}</p>
      </section>

      <section className={styles.bulkQueue} aria-label={locale === "es" ? "Cola de escaneo" : "Scan queue"}>
        <div className={styles.queueHeader}>
          <div><h3>{locale === "es" ? "Cola de revisión" : "Review queue"}</h3><span>{unresolvedCount ? (locale === "es" ? `${unresolvedCount} requieren revisión` : `${unresolvedCount} need review`) : (locale === "es" ? "Todo listo" : "All ready")}</span></div>
          <button type="button" className={styles.primary} disabled={saving || cardCount === 0 || queue.some((item) => item.status === "processing" || item.status === "queued")} onClick={() => void addBatch()}>
            <Check size={16} />{saving ? (locale === "es" ? "Añadiendo…" : "Adding…") : (locale === "es" ? `Añadir ${cardCount} cartas` : `Add ${cardCount} cards to collection`)}
          </button>
        </div>
        {queue.length === 0 && <p className={styles.emptyQueue}>{locale === "es" ? "Coloca una carta en el marco. Se capturará automáticamente cuando esté estable." : "Place a card in the frame. It will capture automatically when stable."}</p>}
        <div className={styles.queueItems}>
          {queue.map((item, index) => (
            <article key={item.id} className={styles.queueItem}>
              <img src={item.previewUrl} alt="" />
              <div>
                <strong>{item.selected?.name ?? (locale === "es" ? `Escaneo ${index + 1}` : `Scan ${index + 1}`)}</strong>
                <span>{item.status.replace("_", " ")} · {Math.round((item.matchConfidence ?? item.captureConfidence) * 100)}%</span>
                <span>{item.language.toUpperCase()} · {listName}</span>
                {item.duplicateWarning && <em>{locale === "es" ? "Copia duplicada agrupada" : "Duplicate copy aggregated"}</em>}
                {item.error && <em>{item.error}</em>}
                {item.candidates.length > 0 && (
                  <label>{locale === "es" ? "Impresión" : "Printing"}
                    <select value={item.selected?.id ?? ""} onChange={(event) => {
                      const selected = item.candidates.find((candidate) => candidate.id === event.target.value) ?? null;
                      updateItem(item.id, { selected, status: selected ? "identified" : "needs_review", purchasePrice: selected?.price ?? item.purchasePrice });
                    }}>
                      <option value="">{locale === "es" ? "Revisar…" : "Review…"}</option>
                      {item.candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.setCode.toUpperCase()} #{candidate.collectorNumber}</option>)}
                    </select>
                  </label>
                )}
                {item.selected && <div className={styles.queueFields}>
                  <label>{locale === "es" ? "Cantidad" : "Quantity"}<input type="number" min="1" max="1000" value={item.quantity} onChange={(event) => updateItem(item.id, { quantity: Math.max(1, Math.min(1000, Number(event.target.value))) })} /></label>
                  <label>{locale === "es" ? "Precio" : "Price"}<input type="number" min="0" step=".01" value={item.purchasePrice ?? ""} onChange={(event) => updateItem(item.id, { purchasePrice: Number(event.target.value) })} /></label>
                  <label>{locale === "es" ? "Estado" : "Condition"}<select value={item.condition} onChange={(event) => updateItem(item.id, { condition: event.target.value as BulkScanItem["condition"] })}><option value="near_mint">Near Mint</option><option value="excellent">Excellent</option><option value="good">Good</option><option value="light_played">Light Played</option></select></label>
                </div>}
              </div>
              <div className={styles.queueActions}>
                <button type="button" onClick={() => { setManualItemId(item.id); setManualQuery(""); setManualResults([]); }} aria-label={locale === "es" ? `Buscar impresión para escaneo ${index + 1}` : `Manual match scan ${index + 1}`}><Search size={15} /></button>
                <button type="button" onClick={() => { removeItem(item.id); setGuidance("move_closer"); }} aria-label={locale === "es" ? `Volver a escanear ${index + 1}` : `Rescan item ${index + 1}`}><Camera size={15} /></button>
                <button type="button" onClick={() => removeItem(item.id)} aria-label={locale === "es" ? `Eliminar escaneo ${index + 1}` : `Remove scan ${index + 1}`}><Trash2 size={15} /></button>
              </div>
            </article>
          ))}
        </div>
        {manualItemId && <div className={styles.manualMatch} role="dialog" aria-label={locale === "es" ? "Buscar impresión" : "Manual printing search"}>
          <label>{locale === "es" ? "Buscar carta" : "Search card"}<input autoFocus value={manualQuery} onChange={(event) => { setManualQuery(event.target.value); if (event.target.value.trim().length < 2) setManualResults([]); }} /></label>
          {manualResults.map((card) => <button type="button" key={card.id} onClick={() => { updateItem(manualItemId, { selected: card, candidates: [card], status: "identified", matchConfidence: 1, purchasePrice: card.price }); setManualItemId(null); setManualResults([]); }}>{card.name} · {card.setCode.toUpperCase()} #{card.collectorNumber}</button>)}
          <button type="button" onClick={() => setManualItemId(null)}>{locale === "es" ? "Cancelar" : "Cancel"}</button>
        </div>}
      </section>
    </div>
  );
}
