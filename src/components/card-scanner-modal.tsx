"use client";

/* eslint-disable @next/next/no-img-element */

import { Camera, Check, ImagePlus, Layers3, RefreshCw, Search, ShieldCheck, X } from "lucide-react";
import { ChangeEvent, FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { CARD_LANGUAGES, type CardLanguage } from "@/lib/card-languages";
import type { CatalogCard, IdentifiedCatalogCard } from "@/lib/catalog";
import { recognizeCardImage } from "@/lib/card-scan";
import type { PortfolioList } from "@/lib/portfolio";
import { formatCurrency } from "@/lib/data";
import { BulkCardScanner } from "./bulk-card-scanner";
import styles from "./card-scanner-modal.module.css";

type Stage = "choose" | "bulk" | "camera" | "review" | "recognizing" | "confirm" | "success" | "error";

type Props = {
  locale: "en" | "es";
  lists: PortfolioList[];
  selectedListId: string;
  onClose: () => void;
  onComplete: (listId: string) => Promise<void>;
};

export function CardScannerModal({
  locale,
  lists,
  selectedListId,
  onClose,
  onComplete,
}: Props) {
  const [stage, setStage] = useState<Stage>("choose");
  const [language, setLanguage] = useState<CardLanguage>("en");
  const [listId, setListId] = useState(selectedListId);
  const [previewUrl, setPreviewUrl] = useState("");
  const [progress, setProgress] = useState(0);
  const [candidates, setCandidates] = useState<IdentifiedCatalogCard[]>([]);
  const [selected, setSelected] = useState<IdentifiedCatalogCard | null>(null);
  const [manualQuery, setManualQuery] = useState("");
  const [manualResults, setManualResults] = useState<IdentifiedCatalogCard[]>([]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const terminateWorkerRef = useRef<(() => Promise<unknown>) | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cancelledRef = useRef(false);
  const previewUrlRef = useRef("");
  const capturedImageRef = useRef<Blob | null>(null);

  const copy = {
    title: locale === "es" ? "Escanear cartas" : "Scan cards",
    private:
      locale === "es"
        ? "La foto no sale de este dispositivo. Solo enviamos texto OCR breve para buscar coincidencias."
        : "Your photo never leaves this device. Only short OCR text is sent to find matches.",
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  useEffect(() => {
    cancelledRef.current = false;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    return () => {
      cancelledRef.current = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      void terminateWorkerRef.current?.();
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    if (stage !== "camera") return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;

    let active = true;
    const markReady = () => {
      if (
        active &&
        video.videoWidth > 0 &&
        video.videoHeight > 0 &&
        stream.getVideoTracks().some((track) => track.readyState === "live")
      ) {
        setCameraReady(true);
        setMessage("");
      }
    };
    const markEnded = () => {
      if (!active) return;
      setCameraReady(false);
      setMessage(
        locale === "es"
          ? "La cámara se ha detenido. Vuelve a iniciarla o sube una foto."
          : "The camera stopped. Start it again or upload a photo.",
      );
    };

    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    video.addEventListener("loadedmetadata", markReady);
    video.addEventListener("canplay", markReady);
    video.addEventListener("playing", markReady);
    stream.getVideoTracks().forEach((track) =>
      track.addEventListener("ended", markEnded),
    );
    void video.play().then(markReady).catch(() => {
      if (!active) return;
      setMessage(
        locale === "es"
          ? "La vista previa está pausada. Toca “Iniciar vista previa”."
          : "The preview is paused. Tap “Start preview”.",
      );
    });

    return () => {
      active = false;
      video.removeEventListener("loadedmetadata", markReady);
      video.removeEventListener("canplay", markReady);
      video.removeEventListener("playing", markReady);
      stream.getVideoTracks().forEach((track) =>
        track.removeEventListener("ended", markEnded),
      );
      if (video.srcObject === stream) video.srcObject = null;
    };
  }, [locale, stage]);

  useEffect(() => {
    if (manualQuery.trim().length < 2 || stage !== "confirm") {
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/cards/search?q=${encodeURIComponent(manualQuery)}`, {
        signal: controller.signal,
      })
        .then((response) => response.json())
        .then((result: { cards?: CatalogCard[] }) =>
          setManualResults(
            (result.cards ?? []).map((card) => ({
              ...card,
              confidence: 1,
              reason: "name_match",
            })),
          ),
        )
        .catch(() => setManualResults([]));
    }, 220);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [manualQuery, stage]);

  const close = () => {
    if (!saving) onClose();
  };

  const trapFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]',
    );
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const beginCamera = async () => {
    setMessage("");
    setCameraReady(false);
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage(
        locale === "es"
          ? "Este navegador no admite cámara. Sube una foto."
          : "This browser does not support camera capture. Upload a photo instead.",
      );
      return;
    }
    try {
      stopCamera();
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
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
      if (!stream.getVideoTracks().some((track) => track.readyState === "live")) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error("camera_stream_inactive");
      }
      streamRef.current = stream;
      setStage("camera");
    } catch {
      setMessage(
        locale === "es"
          ? "No se pudo acceder a la cámara. Permite el acceso o sube una foto."
          : "Camera access was denied. Allow access or upload a photo.",
      );
    }
  };

  const capture = async () => {
    const video = videoRef.current;
    if (!cameraReady || !video || video.videoWidth <= 0 || video.videoHeight <= 0) {
      setMessage(
        locale === "es"
          ? "La cámara aún se está preparando. Espera un momento."
          : "The camera is still getting ready. Wait a moment.",
      );
      return;
    }
    setCapturing(true);
    setMessage("");
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("capture_context_unavailable");
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.92),
      );
      if (!blob) throw new Error("capture_failed");
      stopCamera();
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      const nextPreviewUrl = URL.createObjectURL(blob);
      previewUrlRef.current = nextPreviewUrl;
      capturedImageRef.current = blob;
      setPreviewUrl(nextPreviewUrl);
      setStage("review");
    } catch {
      setMessage(
        locale === "es"
          ? "No se pudo capturar la imagen. Inténtalo de nuevo o sube una foto."
          : "The image could not be captured. Try again or upload a photo.",
      );
    } finally {
      setCapturing(false);
    }
  };

  const chooseFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 15 * 1024 * 1024) {
      setMessage(
        locale === "es"
          ? "Elige una imagen de hasta 15 MB."
          : "Choose an image up to 15 MB.",
      );
      return;
    }
    await recognize(file);
  };

  const recognize = async (image: Blob) => {
    stopCamera();
    if (!previewUrlRef.current) {
      const nextPreviewUrl = URL.createObjectURL(image);
      previewUrlRef.current = nextPreviewUrl;
      setPreviewUrl(nextPreviewUrl);
    }
    setStage("recognizing");
    setProgress(0);
    setMessage("");
    try {
      const { result, terminate } = await recognizeCardImage(
        image,
        language,
        setProgress,
        (workerTerminate) => {
          terminateWorkerRef.current = workerTerminate;
        },
      );
      terminateWorkerRef.current = null;
      await terminate();
      if (cancelledRef.current) return;
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
      const matches = payload.candidates ?? [];
      setCandidates(matches);
      setSelected(matches[0] ?? null);
      setManualQuery("");
      setMessage(
        matches.length
          ? result.confidence < 45
            ? locale === "es"
              ? "Lectura poco clara. Confirma cuidadosamente la impresión."
              : "Low-confidence read. Confirm the printing carefully."
            : ""
          : locale === "es"
            ? "No encontramos una coincidencia. Busca la carta manualmente."
            : "No match found. Search for the card manually.",
      );
      setStage("confirm");
    } catch {
      if (cancelledRef.current) return;
      setMessage(
        navigator.onLine
          ? locale === "es"
            ? "No se pudo leer la imagen. Prueba con más luz o busca manualmente."
            : "The image could not be read. Try better lighting or search manually."
          : locale === "es"
            ? "Sin conexión: no se pudo cargar el modelo OCR. Reconecta e inténtalo de nuevo."
            : "Offline: the OCR model could not load. Reconnect and try again.",
      );
      setStage("error");
    }
  };

  const addHolding = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected || saving) return;
    setSaving(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardId: selected.id,
          quantity: Number(form.get("quantity")),
          purchasePrice: Number(form.get("purchasePrice")),
          condition: form.get("condition"),
          language,
          acquiredAt: form.get("acquiredAt"),
          listId,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "save_failed");
      await onComplete(listId);
      setStage("success");
    } catch {
      setMessage(
        locale === "es"
          ? "No se pudo añadir la carta. Revisa los datos e inténtalo de nuevo."
          : "The card could not be added. Check the details and try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const scanNext = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrlRef.current = "";
    capturedImageRef.current = null;
    setPreviewUrl("");
    setCandidates([]);
    setSelected(null);
    setManualResults([]);
    setManualQuery("");
    setMessage("");
    setProgress(0);
    setStage("choose");
  };

  return (
    <div className={styles.backdrop} onMouseDown={close}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="scanner-title"
        tabIndex={-1}
        onKeyDown={trapFocus}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span className={styles.eyebrow}>
              {locale === "es" ? "OCR en el dispositivo" : "On-device OCR"}
            </span>
            <h2 id="scanner-title">{copy.title}</h2>
          </div>
          <button type="button" onClick={close} aria-label={locale === "es" ? "Cerrar" : "Close"}>
            <X size={19} />
          </button>
        </header>

        <p className={styles.privacy}><ShieldCheck size={16} /> {copy.private}</p>

        {(stage === "choose" || stage === "error") && (
          <>
            <div className={styles.settings}>
              <label>
                {locale === "es" ? "Idioma impreso" : "Printed language"}
                <select value={language} onChange={(event) => setLanguage(event.target.value as CardLanguage)}>
                  {CARD_LANGUAGES.map((item) => <option key={item.code} value={item.code}>{item[locale]}</option>)}
                </select>
              </label>
              <label>
                {locale === "es" ? "Lista de destino" : "Destination list"}
                <select value={listId} onChange={(event) => setListId(event.target.value)}>
                  {lists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}
                </select>
              </label>
            </div>
            {message && <p className={styles.warning} role="alert">{message}</p>}
            <div className={styles.captureChoices}>
              <button type="button" onClick={() => setStage("bulk")}><Layers3 size={24} /><strong>{locale === "es" ? "Escaneo masivo" : "Bulk scan"}</strong><span>{locale === "es" ? "Detección y captura automáticas" : "Automatic detection and capture"}</span></button>
              <button type="button" onClick={() => void beginCamera()}><Camera size={24} /><strong>{locale === "es" ? "Usar cámara" : "Use camera"}</strong><span>{locale === "es" ? "Cámara trasera si está disponible" : "Rear camera when available"}</span></button>
              <button type="button" onClick={() => fileRef.current?.click()}><ImagePlus size={24} /><strong>{locale === "es" ? "Subir foto" : "Upload photo"}</strong><span>{locale === "es" ? "JPG, PNG o WebP · máx. 15 MB" : "JPG, PNG, or WebP · max 15 MB"}</span></button>
            </div>
          </>
        )}

        {stage === "bulk" && (
          <BulkCardScanner
            locale={locale}
            language={language}
            listId={listId}
            listName={lists.find((list) => list.id === listId)?.name ?? ""}
            onUpload={() => fileRef.current?.click()}
            onManualMode={() => setStage("choose")}
            onComplete={onComplete}
          />
        )}

        {stage === "camera" && (
          <div className={styles.camera}>
            <div className={styles.cameraViewport} data-ready={cameraReady}>
              <video ref={videoRef} muted playsInline autoPlay aria-label={locale === "es" ? "Vista de cámara" : "Camera preview"} />
              <div className={styles.frame} aria-hidden="true" />
              {!cameraReady && <span className={styles.cameraStatus} role="status">{locale === "es" ? "Preparando cámara…" : "Preparing camera…"}</span>}
            </div>
            <p>{locale === "es" ? "Alinea la carta dentro del marco vertical." : "Align the card inside the portrait frame."}</p>
            {message && <p className={styles.warning} role="alert">{message}</p>}
            <div className={styles.cameraActions}>
              {!cameraReady && <button type="button" onClick={() => void videoRef.current?.play()}>{locale === "es" ? "Iniciar vista previa" : "Start preview"}</button>}
              <button type="button" onClick={() => fileRef.current?.click()}>{locale === "es" ? "Subir foto" : "Upload photo"}</button>
              <button type="button" className={styles.primary} disabled={!cameraReady || capturing} onClick={() => void capture()}><Camera size={18} /> {capturing ? (locale === "es" ? "Capturando…" : "Capturing…") : (locale === "es" ? "Capturar" : "Capture")}</button>
            </div>
          </div>
        )}

        {stage === "review" && previewUrl && (
          <div className={styles.captureReview}>
            <img src={previewUrl} alt={locale === "es" ? "Carta capturada" : "Captured card"} />
            <strong>{locale === "es" ? "Comprueba la foto" : "Review the photo"}</strong>
            <span>{locale === "es" ? "La carta debe verse nítida y completa." : "The card should be sharp and fully visible."}</span>
            <div className={styles.actions}>
              <button type="button" onClick={() => { scanNext(); void beginCamera(); }}>{locale === "es" ? "Repetir" : "Retake"}</button>
              <button type="button" className={styles.primary} onClick={() => { if (capturedImageRef.current) void recognize(capturedImageRef.current); }}>{locale === "es" ? "Reconocer" : "Recognize"}</button>
            </div>
          </div>
        )}

        {stage === "recognizing" && (
          <div className={styles.progress} aria-live="polite">
            {previewUrl && <img src={previewUrl} alt="" />}
            <RefreshCw size={28} className={styles.spinner} />
            <strong>{locale === "es" ? "Leyendo la carta…" : "Reading card…"}</strong>
            <progress max="1" value={progress}>{Math.round(progress * 100)}%</progress>
            <span>{locale === "es" ? "El modelo de idioma se carga solo para este escaneo." : "Only this scan’s language model is loaded."}</span>
          </div>
        )}

        {stage === "confirm" && (
          <form onSubmit={addHolding}>
            <div className={styles.confirmGrid}>
              {previewUrl && <img className={styles.preview} src={previewUrl} alt={locale === "es" ? "Foto capturada" : "Captured card"} />}
              <div>
                <h3>{locale === "es" ? "Confirma la impresión exacta" : "Confirm the exact printing"}</h3>
                {message && <p className={styles.warning} role="status">{message}</p>}
                <div className={styles.candidates}>
                  {candidates.map((card) => (
                    <button key={card.id} type="button" data-selected={selected?.id === card.id} onClick={() => setSelected(card)}>
                      {card.imageUrl && <img src={card.imageUrl} alt="" />}
                      <span><strong>{card.name}</strong><small>{card.setName} · {card.setCode.toUpperCase()} #{card.collectorNumber}</small><em>{Math.round(card.confidence * 100)}% · {card.reason.replace("_", " ")}</em></span>
                      <b>{card.price === null ? "—" : formatCurrency(card.price)}</b>
                    </button>
                  ))}
                </div>
                <label className={styles.manualSearch}>
                  {locale === "es" ? "¿No es correcta? Buscar manualmente" : "Not correct? Search manually"}
                  <span><Search size={15} /><input value={manualQuery} onChange={(event) => { setManualQuery(event.target.value); if (event.target.value.trim().length < 2) setManualResults([]); }} placeholder="Black Lotus…" /></span>
                </label>
                {manualResults.length > 0 && <div className={styles.manualResults}>{manualResults.map((card) => <button type="button" key={card.id} onClick={() => { setSelected(card); setCandidates((current) => current.some((item) => item.id === card.id) ? current : [card, ...current]); setManualResults([]); setManualQuery(""); }}><strong>{card.name}</strong><small>{card.setName} · #{card.collectorNumber}</small></button>)}</div>}
              </div>
            </div>
            {selected && (
              <div className={styles.details}>
                <div><strong>{selected.name}</strong><span>{selected.setName} · {selected.setCode.toUpperCase()} #{selected.collectorNumber}</span></div>
                <div className={styles.settings}>
                  <label>{locale === "es" ? "Cantidad" : "Quantity"}<input name="quantity" type="number" min="1" max="1000000" defaultValue="1" required /></label>
                  <label>{locale === "es" ? "Precio unitario" : "Unit price"}<input key={selected.id} name="purchasePrice" type="number" min="0" max="999999999999.99" step=".01" defaultValue={selected.price ?? ""} required /></label>
                  <label>{locale === "es" ? "Estado" : "Condition"}<select name="condition" defaultValue="near_mint"><option value="near_mint">Near Mint</option><option value="excellent">Excellent</option><option value="good">Good</option><option value="light_played">Light Played</option></select></label>
                  <label>{locale === "es" ? "Fecha de compra" : "Purchase date"}<input name="acquiredAt" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></label>
                </div>
              </div>
            )}
            <div className={styles.actions}>
              <button type="button" onClick={scanNext}>{locale === "es" ? "Volver a escanear" : "Retake"}</button>
              <button className={styles.primary} disabled={!selected || saving}><Check size={17} /> {saving ? (locale === "es" ? "Añadiendo…" : "Adding…") : (locale === "es" ? "Confirmar y añadir" : "Confirm and add")}</button>
            </div>
          </form>
        )}

        {stage === "success" && (
          <div className={styles.success} role="status" aria-live="polite">
            <Check size={34} />
            <h3>{locale === "es" ? "Carta añadida como lote separado" : "Card added as a separate lot"}</h3>
            <p>{selected?.name}</p>
            <div className={styles.actions}><button type="button" onClick={close}>{locale === "es" ? "Terminar" : "Done"}</button><button type="button" className={styles.primary} onClick={scanNext}>{locale === "es" ? "Escanear otra" : "Scan next card"}</button></div>
          </div>
        )}

        <input ref={fileRef} className={styles.fileInput} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => void chooseFile(event)} />
      </div>
    </div>
  );
}
