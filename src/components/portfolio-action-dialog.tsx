"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";
import type { PortfolioList } from "@/lib/portfolio";
import styles from "@/app/portfolio/portfolio.module.css";

type Locale = "en" | "es";

function useDialogFocus(
  open: boolean,
  busy: boolean,
  onClose: () => void,
) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    firstButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      returnFocusRef.current?.focus();
    };
  }, [open]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && !busy) {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      "button:not(:disabled), select:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex='-1'])",
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

  return { dialogRef, firstButtonRef, onKeyDown };
}

export function BulkActionDialog({
  action,
  count,
  sourceName,
  destinations,
  destinationId,
  busy,
  error,
  locale,
  onDestinationChange,
  onClose,
  onConfirm,
}: {
  action: "move" | "copy" | "delete" | null;
  count: number;
  sourceName: string;
  destinations: PortfolioList[];
  destinationId: string;
  busy: boolean;
  error: string;
  locale: Locale;
  onDestinationChange: (id: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const open = action !== null;
  const { dialogRef, firstButtonRef, onKeyDown } = useDialogFocus(
    open,
    busy,
    onClose,
  );
  if (!action) return null;
  const needsDestination = action !== "delete";
  const title =
    action === "move"
      ? locale === "es" ? "Mover posiciones" : "Move holdings"
      : action === "copy"
        ? locale === "es" ? "Copiar posiciones" : "Copy holdings"
        : locale === "es" ? "Eliminar posiciones" : "Remove holdings";
  const consequence =
    action === "move"
      ? locale === "es"
        ? `Las ${count} posiciones dejarán “${sourceName}” y pasarán a la lista elegida.`
        : `${count} holdings will leave “${sourceName}” and move to the chosen list.`
      : action === "copy"
        ? locale === "es"
          ? `Se crearán ${count} copias en la lista elegida. Los originales permanecerán en “${sourceName}”.`
          : `${count} copies will be created in the chosen list. Originals remain in “${sourceName}”.`
        : locale === "es"
          ? `Se eliminarán permanentemente ${count} posiciones de “${sourceName}”. Esta acción no se puede deshacer.`
          : `${count} holdings will be permanently removed from “${sourceName}”. This cannot be undone.`;

  return (
    <div className={styles.actionBackdrop} onMouseDown={() => !busy && onClose()}>
      <div
        ref={dialogRef}
        className={styles.actionDialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-action-title"
        aria-describedby="bulk-action-description"
        aria-busy={busy}
        onKeyDown={onKeyDown}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <span className={styles.actionKicker}>
          {count} {locale === "es" ? "seleccionadas" : "selected"}
        </span>
        <h2 id="bulk-action-title">{title}</h2>
        <p id="bulk-action-description">{consequence}</p>
        {needsDestination && (
          <label className={styles.destinationField}>
            <span>{locale === "es" ? "Lista de destino" : "Destination list"}</span>
            <select
              value={destinationId}
              disabled={busy}
              onChange={(event) => onDestinationChange(event.target.value)}
            >
              <option value="">
                {locale === "es" ? "Selecciona una lista" : "Select a list"}
              </option>
              {destinations.map((list) => (
                <option value={list.id} key={list.id}>
                  {list.name} · {list.holdingCount}{" "}
                  {locale === "es" ? "posiciones" : "holdings"}
                </option>
              ))}
            </select>
          </label>
        )}
        {error && <p className={styles.dialogError} role="alert">{error}</p>}
        <div className={styles.dialogActions}>
          <button
            ref={firstButtonRef}
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            {locale === "es" ? "Cancelar" : "Cancel"}
          </button>
          <button
            type="button"
            data-danger={action === "delete"}
            disabled={busy || (needsDestination && !destinationId)}
            onClick={onConfirm}
          >
            {busy
              ? locale === "es" ? "Procesando…" : "Working…"
              : action === "move"
                ? locale === "es" ? "Mover posiciones" : "Move holdings"
                : action === "copy"
                  ? locale === "es" ? "Crear copias" : "Create copies"
                  : locale === "es" ? "Eliminar definitivamente" : "Remove permanently"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ConfirmationDialog({
  open,
  title,
  description,
  confirmLabel,
  busy,
  locale,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  busy: boolean;
  locale: Locale;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { dialogRef, firstButtonRef, onKeyDown } = useDialogFocus(
    open,
    busy,
    onClose,
  );
  if (!open) return null;
  return (
    <div className={styles.actionBackdrop} onMouseDown={() => !busy && onClose()}>
      <div
        ref={dialogRef}
        className={styles.actionDialog}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-description"
        aria-busy={busy}
        onKeyDown={onKeyDown}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="confirm-title">{title}</h2>
        <p id="confirm-description">{description}</p>
        <div className={styles.dialogActions}>
          <button ref={firstButtonRef} type="button" disabled={busy} onClick={onClose}>
            {locale === "es" ? "Cancelar" : "Cancel"}
          </button>
          <button type="button" data-danger="true" disabled={busy} onClick={onConfirm}>
            {busy
              ? locale === "es" ? "Eliminando…" : "Removing…"
              : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
