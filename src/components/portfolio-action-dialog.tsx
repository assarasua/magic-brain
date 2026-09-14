"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { PortfolioHolding, PortfolioList } from "@/lib/portfolio";
import { formatCurrency } from "@/lib/data";
import { calculatePortfolioSaleAmounts } from "@/lib/portfolio-model";
import styles from "@/app/portfolio/portfolio.module.css";

type Locale = "en" | "es";

function useDialogFocus<T extends HTMLElement>(
  open: boolean,
  busy: boolean,
  onClose: () => void,
) {
  const dialogRef = useRef<T>(null);
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

  const onKeyDown = (event: KeyboardEvent<T>) => {
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
  const { dialogRef, firstButtonRef, onKeyDown } = useDialogFocus<HTMLDivElement>(
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
  const { dialogRef, firstButtonRef, onKeyDown } = useDialogFocus<HTMLDivElement>(
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

export function RecordSaleDialog({
  holding,
  busy,
  error,
  locale,
  onClose,
  onConfirm,
}: {
  holding: PortfolioHolding | null;
  busy: boolean;
  error: string;
  locale: Locale;
  onClose: () => void;
  onConfirm: (input: {
    quantity: number;
    saleUnitPrice: number;
    soldAt: string;
  }) => void;
}) {
  const open = holding !== null;
  const [quantity, setQuantity] = useState("1");
  const [saleUnitPrice, setSaleUnitPrice] = useState(
    holding?.currentPrice === null || holding === null
      ? ""
      : holding.currentPrice.toFixed(2),
  );
  const [soldAt, setSoldAt] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const { dialogRef, onKeyDown } = useDialogFocus<HTMLFormElement>(
    open,
    busy,
    onClose,
  );

  if (!holding) return null;
  const numericQuantity = Number(quantity);
  const numericSalePrice = Number(saleUnitPrice);
  const valid =
    Number.isInteger(numericQuantity) &&
    numericQuantity >= 1 &&
    numericQuantity <= holding.quantity &&
    saleUnitPrice.trim() !== "" &&
    Number.isFinite(numericSalePrice) &&
    numericSalePrice >= 0 &&
    Math.abs(numericSalePrice * 100 - Math.round(numericSalePrice * 100)) < 1e-7 &&
    /^\d{4}-\d{2}-\d{2}$/.test(soldAt);
  const amounts = valid
    ? calculatePortfolioSaleAmounts(
        numericQuantity,
        holding.purchasePrice,
        numericSalePrice,
      )
    : null;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!valid || busy) return;
    onConfirm({
      quantity: numericQuantity,
      saleUnitPrice: numericSalePrice,
      soldAt,
    });
  };

  return (
    <div className={styles.actionBackdrop} onMouseDown={() => !busy && onClose()}>
      <form
        ref={dialogRef}
        className={styles.actionDialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="record-sale-title"
        aria-describedby="record-sale-description"
        aria-busy={busy}
        onSubmit={submit}
        onKeyDown={onKeyDown}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <span className={styles.actionKicker}>
          {holding.name} · {holding.quantity}×
        </span>
        <h2 id="record-sale-title">
          {locale === "es" ? "Registrar venta" : "Record sale"}
        </h2>
        <p id="record-sale-description">
          {locale === "es"
            ? "Registra una venta parcial o completa. El historial de la venta se conservará."
            : "Record a partial or full sale. The sale history will be preserved."}
        </p>
        <div className={styles.saleFields}>
          <label>
            <span>{locale === "es" ? "Cantidad vendida" : "Quantity sold"}</span>
            <input
              autoFocus
              type="number"
              min="1"
              max={holding.quantity}
              step="1"
              required
              value={quantity}
              disabled={busy}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </label>
          <label>
            <span>{locale === "es" ? "Precio unitario (EUR)" : "Unit sale price (EUR)"}</span>
            <input
              type="number"
              min="0"
              max="999999999999.99"
              step=".01"
              required
              value={saleUnitPrice}
              disabled={busy}
              onChange={(event) => setSaleUnitPrice(event.target.value)}
            />
          </label>
          <label>
            <span>{locale === "es" ? "Fecha de venta" : "Sale date"}</span>
            <input
              type="date"
              min={holding.acquiredAt}
              max={new Date().toISOString().slice(0, 10)}
              required
              value={soldAt}
              disabled={busy}
              onChange={(event) => setSoldAt(event.target.value)}
            />
          </label>
        </div>
        {amounts && (
          <dl className={styles.salePreview} aria-live="polite">
            <div><dt>{locale === "es" ? "Ingresos" : "Proceeds"}</dt><dd>{formatCurrency(amounts.proceeds)}</dd></div>
            <div><dt>{locale === "es" ? "Coste asignado" : "Allocated cost basis"}</dt><dd>{formatCurrency(amounts.costBasis)}</dd></div>
            <div data-positive={amounts.realizedPnl >= 0}><dt>{locale === "es" ? "P&L realizado" : "Realized P&L"}</dt><dd>{amounts.realizedPnl >= 0 ? "+" : ""}{formatCurrency(amounts.realizedPnl)}</dd></div>
          </dl>
        )}
        {error && <p className={styles.dialogError} role="alert">{error}</p>}
        <div className={styles.dialogActions}>
          <button type="button" disabled={busy} onClick={onClose}>
            {locale === "es" ? "Cancelar" : "Cancel"}
          </button>
          <button type="submit" disabled={busy || !valid}>
            {busy
              ? locale === "es" ? "Registrando…" : "Recording…"
              : locale === "es" ? "Confirmar venta" : "Confirm sale"}
          </button>
        </div>
      </form>
    </div>
  );
}
