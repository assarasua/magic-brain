"use client";

/* eslint-disable @next/next/no-img-element */

import { Camera, Check, ImagePlus, RefreshCw, Search, ShieldCheck, X } from "lucide-react";
import { ChangeEvent, FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { CARD_LANGUAGES, type CardLanguage } from "@/lib/card-languages";
import type { CatalogCard, IdentifiedCatalogCard } from "@/lib/catalog";
import { recognizeCardImage } from "@/lib/card-scan";
import type { PortfolioList } from "@/lib/portfolio";
import { formatCurrency } from "@/lib/data";
import styles from "./card-scanner-modal.module.css";

type Stage = "choose" | "camera" | "recognizing" | "confirm" | "success" | "error";

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
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const terminateWorkerRef = useRef<(() => Promise<unknown>) | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cancelledRef = useRef(false);
  const previewUrlRef = useRef("");

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
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage(
        locale === "es"
          ? "Este navegador no admite cámara. Sube una foto."
          : "This browser does not support camera capture. Upload a photo instead.",
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      setStage("camera");
      window.setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      }, 0);
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
    if (!video?.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.92),
    );
    stopCamera();
    if (blob) await recognize(blob);
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
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const nextPreviewUrl = URL.createObjectURL(image);
    previewUrlRef.current = nextPreviewUrl;
    setPreviewUrl(nextPreviewUrl);
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
              <button type="button" onClick={() => void beginCamera()}><Camera size={24} /><strong>{locale === "es" ? "Usar cámara" : "Use camera"}</strong><span>{locale === "es" ? "Cámara trasera si está disponible" : "Rear camera when available"}</span></button>
              <button type="button" onClick={() => fileRef.current?.click()}><ImagePlus size={24} /><strong>{locale === "es" ? "Subir foto" : "Upload photo"}</strong><span>{locale === "es" ? "JPG, PNG o WebP · máx. 15 MB" : "JPG, PNG, or WebP · max 15 MB"}</span></button>
            </div>
          </>
        )}

        {stage === "camera" && (
          <div className={styles.camera}>
            <video ref={videoRef} muted playsInline aria-label={locale === "es" ? "Vista de cámara" : "Camera preview"} />
            <div className={styles.frame} aria-hidden="true" />
            <p>{locale === "es" ? "Alinea la carta dentro del marco." : "Align the card inside the frame."}</p>
            <button type="button" className={styles.primary} onClick={() => void capture()}><Camera size={18} /> {locale === "es" ? "Capturar" : "Capture"}</button>
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
