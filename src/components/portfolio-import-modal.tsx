"use client";

import { AlertCircle, CheckCircle2, FileText, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  parsePortfolioImport,
  type PortfolioImportRow,
  type PortfolioImportSource,
} from "@/lib/portfolio-import-model";
import styles from "@/app/portfolio/portfolio.module.css";

type Locale = "en" | "es";

type Candidate = {
  id: string;
  name: string;
  setCode: string;
  setName: string;
  collectorNumber: string;
  imageUrl: string | null;
};

type ResolvedRow = PortfolioImportRow & {
  status: "matched" | "ambiguous" | "unmatched";
  candidates: Candidate[];
  existing: boolean;
};

const sourceDetails: Record<
  PortfolioImportSource,
  { label: string; hint: Record<Locale, string> }
> = {
  moxfield: {
    label: "Moxfield",
    hint: {
      en: "Collection → Export → CSV, or paste a deck text export. No account connection is used.",
      es: "Colección → Exportar → CSV, o pega una exportación de mazo en texto. No conectamos tu cuenta.",
    },
  },
  deckstats: {
    label: "Deckstats",
    hint: {
      en: "Export your collection CSV, or download/paste a deck as text with printing details.",
      es: "Exporta el CSV de tu colección, o descarga/pega un mazo como texto con datos de impresión.",
    },
  },
  csv: {
    label: "CSV",
    hint: {
      en: "Upload a CSV with card name and optional quantity, set, collector number, price, language and condition.",
      es: "Sube un CSV con nombre y, opcionalmente, cantidad, set, número, precio, idioma y estado.",
    },
  },
  text: {
    label: "Text",
    hint: {
      en: "Paste one card per line, such as “4 Card Name”, “4x Card Name” or “1 Card (SET) 123”.",
      es: "Pega una carta por línea: «4 Nombre», «4x Nombre» o «1 Nombre (SET) 123».",
    },
  },
};

const localizeParseError = (message: string, locale: Locale) => {
  if (locale === "en") return message;
  const exact: Record<string, string> = {
    "File is too large": "El archivo es demasiado grande",
    "Text is too large": "El texto es demasiado grande",
    "Unclosed quoted field": "Hay un campo entrecomillado sin cerrar",
    "CSV needs a header and at least one row":
      "El CSV necesita una cabecera y al menos una fila",
    "No card-name column was found":
      "No se encontró una columna con el nombre de la carta",
    "Card name is required": "Falta el nombre de la carta",
    "Quantity must be a positive whole number":
      "La cantidad debe ser un número entero positivo",
    "Purchase price must be non-negative with up to 2 decimals":
      "El precio debe ser positivo y tener hasta 2 decimales",
    "Date must use YYYY-MM-DD": "La fecha debe usar AAAA-MM-DD",
    "Expected “quantity card name”": "Se esperaba «cantidad nombre de carta»",
  };
  if (exact[message]) return exact[message];
  if (message.startsWith("Unsupported condition:")) {
    return message.replace("Unsupported condition:", "Estado no compatible:");
  }
  if (message.startsWith("Unsupported language:")) {
    return message.replace("Unsupported language:", "Idioma no compatible:");
  }
  if (message.startsWith("Imports are limited to")) {
    return message.replace("Imports are limited to", "Las importaciones se limitan a");
  }
  return message;
};

export function PortfolioImportModal({
  locale,
  onClose,
  onComplete,
}: {
  locale: Locale;
  onClose: () => void;
  onComplete: () => Promise<void>;
}) {
  const [source, setSource] = useState<PortfolioImportSource>("moxfield");
  const [input, setInput] = useState("");
  const [filename, setFilename] = useState("");
  const [resolved, setResolved] = useState<ResolvedRow[]>([]);
  const [selections, setSelections] = useState<Record<number, string>>({});
  const [parseErrors, setParseErrors] = useState<
    Array<{ row: number; message: string }>
  >([]);
  const [requestError, setRequestError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [existingStrategy, setExistingStrategy] = useState<"add" | "skip">(
    "add",
  );
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const selectedRows = useMemo(
    () => resolved.filter((row) => Boolean(selections[row.row])),
    [resolved, selections],
  );
  const unresolvedCount = resolved.length - selectedRows.length;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 500_000) {
      setRequestError(
        locale === "es" ? "El archivo supera 500 KB." : "The file exceeds 500 KB.",
      );
      return;
    }
    setFilename(file.name);
    setInput(await file.text());
    setResolved([]);
    setRequestError("");
  };

  const preview = async () => {
    setRequestError("");
    setReviewed(false);
    const firstLine = input.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] ?? "";
    const format =
      source === "csv" || filename.toLowerCase().endsWith(".csv") || firstLine.includes(",")
        ? "csv"
        : "text";
    const parsed = parsePortfolioImport(input, format);
    setParseErrors(parsed.errors);
    if (parsed.rows.length === 0) return;
    setBusy(true);
    try {
      const response = await fetch("/api/portfolio/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview", rows: parsed.rows }),
      });
      const result = (await response.json()) as {
        rows?: ResolvedRow[];
        error?: string;
      };
      if (!response.ok || !result.rows) {
        throw new Error(result.error ?? "Preview failed");
      }
      setResolved(result.rows);
      setSelections(
        Object.fromEntries(
          result.rows
            .filter((row) => row.status === "matched")
            .map((row) => [row.row, row.candidates[0].id]),
        ),
      );
    } catch {
      setRequestError(
        locale === "es"
          ? "No se pudo resolver la lista. Inténtalo de nuevo."
          : "The list could not be resolved. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    setRequestError("");
    try {
      const rows = selectedRows.map((row) => ({
        cardId: selections[row.row],
        quantity: row.quantity,
        purchasePrice: row.purchasePrice,
        condition: row.condition,
        language: row.language,
        acquiredAt: row.acquiredAt,
      }));
      const response = await fetch("/api/portfolio/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "confirm",
          rows,
          existingStrategy,
        }),
      });
      if (!response.ok) throw new Error("Import failed");
      await onComplete().catch(() => undefined);
      onClose();
    } catch {
      setRequestError(
        locale === "es"
          ? "No se importó ninguna posición. Revisa la lista e inténtalo de nuevo."
          : "No holdings were imported. Review the list and try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card-detail-backdrop" onMouseDown={onClose}>
      <section
        className={styles.importModal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="portfolio-import-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          ref={closeButtonRef}
          type="button"
          className="detail-close"
          onClick={onClose}
          aria-label={locale === "es" ? "Cerrar" : "Close"}
        >
          <X size={18} />
        </button>
        <span className="eyebrow">
          {locale === "es" ? "Importación segura" : "Secure import"}
        </span>
        <h2 id="portfolio-import-title">
          {resolved.length
            ? locale === "es"
              ? "Revisa las coincidencias"
              : "Review matches"
            : locale === "es"
              ? "Importa tu cartera"
              : "Import your portfolio"}
        </h2>

        {!resolved.length ? (
          <>
            <div className={styles.sourceGrid}>
              {(Object.keys(sourceDetails) as PortfolioImportSource[]).map(
                (option) => (
                  <button
                    type="button"
                    key={option}
                    data-active={source === option}
                    aria-pressed={source === option}
                    onClick={() => {
                      setSource(option);
                      setResolved([]);
                    }}
                  >
                    {option === "text" ? <FileText size={17} /> : <Upload size={17} />}
                    <strong>{sourceDetails[option].label}</strong>
                  </button>
                ),
              )}
            </div>
            <p className={styles.sourceHint}>{sourceDetails[source].hint[locale]}</p>
            <label className={styles.fileDrop}>
              <Upload size={18} />
              <span>
                {filename ||
                  (locale === "es"
                    ? "Selecciona un archivo CSV o TXT"
                    : "Choose a CSV or TXT file")}
              </span>
              <input
                type="file"
                accept=".csv,.txt,text/csv,text/plain"
                onChange={(event) => void readFile(event.target.files?.[0])}
              />
            </label>
            <div className={styles.or}>
              <span>{locale === "es" ? "o pega el contenido" : "or paste content"}</span>
            </div>
            <textarea
              className={styles.importTextarea}
              value={input}
              onChange={(event) => {
                setInput(event.target.value);
                setFilename("");
              }}
              placeholder={
                source === "text"
                  ? "4 Lightning Bolt\n1 Black Lotus (LEA) 232"
                  : "Count,Name,Edition,Collector Number\n4,Lightning Bolt,2XM,117"
              }
              aria-label={locale === "es" ? "Contenido a importar" : "Import content"}
            />
            {parseErrors.length > 0 && (
              <div className={styles.importErrors} role="alert">
                <AlertCircle size={16} />
                <div>
                  {parseErrors.slice(0, 8).map((error) => (
                    <p key={`${error.row}-${error.message}`}>
                      {error.row > 0
                        ? `${locale === "es" ? "Fila" : "Row"} ${error.row}: `
                        : ""}
                      {localizeParseError(error.message, locale)}
                    </p>
                  ))}
                  {parseErrors.length > 8 && <p>+{parseErrors.length - 8}</p>}
                </div>
              </div>
            )}
            <button
              type="button"
              className="primary-button form-submit"
              disabled={!input.trim() || busy}
              onClick={() => void preview()}
            >
              {busy
                ? locale === "es"
                  ? "Comprobando…"
                  : "Checking…"
                : locale === "es"
                  ? "Revisar importación"
                  : "Review import"}
            </button>
          </>
        ) : (
          <>
            <div className={styles.importSummary}>
              <span>
                <CheckCircle2 size={15} /> {selectedRows.length}{" "}
                {locale === "es" ? "listas" : "ready"}
              </span>
              <span data-warning={unresolvedCount > 0}>
                {unresolvedCount} {locale === "es" ? "sin resolver" : "unresolved"}
              </span>
              {parseErrors.length > 0 && (
                <span data-warning="true">
                  {parseErrors.length} {locale === "es" ? "errores omitidos" : "errors skipped"}
                </span>
              )}
            </div>
            <div className={styles.importRows}>
              {resolved.map((row) => (
                <article key={row.row} data-status={row.status}>
                  <div>
                    <strong>
                      {row.quantity}× {row.name}
                    </strong>
                    <span>
                      {row.setCode?.toUpperCase() || "—"}
                      {row.collectorNumber ? ` #${row.collectorNumber}` : ""}
                      {" · "}€{row.purchasePrice.toFixed(2)}
                      {row.existing
                        ? ` · ${locale === "es" ? "ya en cartera" : "already held"}`
                        : ""}
                    </span>
                  </div>
                  {row.candidates.length > 0 ? (
                    <select
                      aria-label={`${locale === "es" ? "Coincidencia para" : "Match for"} ${row.name}`}
                      value={selections[row.row] ?? ""}
                      onChange={(event) =>
                        setSelections((current) => ({
                          ...current,
                          [row.row]: event.target.value,
                        }))
                      }
                    >
                      <option value="">
                        {row.status === "ambiguous"
                          ? locale === "es"
                            ? "Selecciona una impresión"
                            : "Choose a printing"
                          : locale === "es"
                            ? "Omitir"
                            : "Skip"}
                      </option>
                      {row.candidates.map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          {candidate.setCode.toUpperCase()} #{candidate.collectorNumber} ·{" "}
                          {candidate.setName}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className={styles.unmatched}>
                      {locale === "es" ? "Sin coincidencia exacta" : "No exact match"}
                    </span>
                  )}
                </article>
              ))}
            </div>
            <fieldset className={styles.duplicateChoice}>
              <legend>
                {locale === "es" ? "Cartas ya existentes" : "Existing cards"}
              </legend>
              <label>
                <input
                  type="radio"
                  checked={existingStrategy === "add"}
                  onChange={() => setExistingStrategy("add")}
                />
                {locale === "es" ? "Añadir como lotes nuevos" : "Add as new lots"}
              </label>
              <label>
                <input
                  type="radio"
                  checked={existingStrategy === "skip"}
                  onChange={() => setExistingStrategy("skip")}
                />
                {locale === "es" ? "Omitir cartas existentes" : "Skip existing cards"}
              </label>
            </fieldset>
            <label className={styles.reviewCheck}>
              <input
                type="checkbox"
                checked={reviewed}
                onChange={(event) => setReviewed(event.target.checked)}
              />
              {locale === "es"
                ? "He revisado las impresiones y los precios."
                : "I reviewed the printings and purchase prices."}
            </label>
            <div className={styles.importActions}>
              <button
                type="button"
                onClick={() => {
                  setResolved([]);
                  setSelections({});
                }}
              >
                {locale === "es" ? "Atrás" : "Back"}
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={!reviewed || selectedRows.length === 0 || busy}
                onClick={() => void confirm()}
              >
                {busy
                  ? locale === "es"
                    ? "Importando…"
                    : "Importing…"
                  : `${locale === "es" ? "Importar" : "Import"} ${selectedRows.length}`}
              </button>
            </div>
          </>
        )}
        {requestError && (
          <div className={styles.requestError} role="alert">
            {requestError}
          </div>
        )}
      </section>
    </div>
  );
}
