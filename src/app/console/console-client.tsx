"use client";

import {
  Check,
  Clipboard,
  Command,
  LoaderCircle,
  Play,
  Square,
  TerminalSquare,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  FormEvent,
  KeyboardEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { MagicBrainLogo } from "@/components/brand-logo";
import {
  LanguageToggle,
  useLanguage,
} from "@/components/language-provider";
import {
  CONSOLE_EXAMPLES,
  CONSOLE_MAX_OUTPUT_CHARS,
  ConsoleCommandError,
  parseConsoleCommand,
  type ConsoleCategory,
  type ConsolePlan,
  type ConsoleView,
} from "@/lib/console-command";
import styles from "./console.module.css";

type ConsoleEntry = {
  id: string;
  command: string;
  terminalCommand?: string;
  view: ConsoleView;
  json: boolean;
  status: "success" | "error" | "cancelled";
  result: unknown;
};

const mcpUrl = "https://magic-brain-mcp.assarasua.workers.dev/mcp";

export function ConsoleClient() {
  const { locale } = useLanguage();
  const { status: sessionStatus } = useSession();
  const es = locale === "es";
  const [command, setCommand] = useState("help");
  const [entries, setEntries] = useState<ConsoleEntry[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState("");
  const controllerRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = useMemo(() => {
    const query = command.trim().toLowerCase();
    if (!query) return CONSOLE_EXAMPLES.slice(0, 6);
    return CONSOLE_EXAMPLES.filter((example) =>
      example.toLowerCase().includes(query),
    ).slice(0, 6);
  }, [command]);

  const execute = async (event?: FormEvent) => {
    event?.preventDefault();
    if (running) return;
    const submitted = command.trim();
    let plan: ConsolePlan;
    try {
      plan = parseConsoleCommand(submitted);
    } catch (error) {
      addEntry({
        command: submitted,
        view: "status",
        json: false,
        status: "error",
        result: {
          error:
            error instanceof ConsoleCommandError
              ? error.message
              : copy(locale).unexpected,
        },
      });
      return;
    }

    const controller = new AbortController();
    controllerRef.current = controller;
    setRunning(true);
    setHistory((current) =>
      [submitted, ...current.filter((item) => item !== submitted)].slice(0, 50),
    );
    setHistoryIndex(-1);
    try {
      if (plan.kind === "request" && plan.auth === "personal") {
        if (sessionStatus !== "authenticated") {
          throw new ConsoleCommandError(copy(locale).signInRequired);
        }
      }
      const result = await executePlan(
        plan,
        controller.signal,
        locale,
        sessionStatus === "authenticated",
      );
      addEntry({
        command: submitted,
        terminalCommand: plan.terminalCommand,
        view: plan.view,
        json: plan.json,
        status: "success",
        result,
      });
      track(plan.category, "success", locale);
    } catch (error) {
      const cancelled = controller.signal.aborted;
      addEntry({
        command: submitted,
        terminalCommand: plan.terminalCommand,
        view: plan.view,
        json: plan.json,
        status: cancelled ? "cancelled" : "error",
        result: {
          error: cancelled
            ? copy(locale).cancelled
            : sanitizeError(error, locale),
        },
      });
      track(plan.category, cancelled ? "cancelled" : "error", locale);
    } finally {
      controllerRef.current = null;
      setRunning(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  const addEntry = (entry: Omit<ConsoleEntry, "id">) => {
    setEntries((current) => [
      { ...entry, id: crypto.randomUUID() },
      ...current,
    ].slice(0, 20));
  };

  const selectExample = (value: string) => {
    setCommand(value);
    inputRef.current?.focus();
  };

  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowUp" && history.length) {
      event.preventDefault();
      const next = Math.min(historyIndex + 1, history.length - 1);
      setHistoryIndex(next);
      setCommand(history[next]);
    } else if (event.key === "ArrowDown" && historyIndex >= 0) {
      event.preventDefault();
      const next = historyIndex - 1;
      setHistoryIndex(next);
      setCommand(next >= 0 ? history[next] : "");
    } else if (event.key === "Tab" && suggestions[0]) {
      event.preventDefault();
      selectExample(suggestions[0]);
    }
  };

  const copyText = async (value: string, id: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(id);
    window.setTimeout(() => setCopied(""), 1_500);
  };

  const labels = copy(locale);
  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/" aria-label="Magic Brain home">
          <MagicBrainLogo />
        </Link>
        <nav aria-label={es ? "Navegación de consola" : "Console navigation"}>
          <Link href="/developers">{labels.developerHub}</Link>
          <LanguageToggle />
        </nav>
      </header>
      <section className={styles.intro}>
        <div>
          <span className={styles.eyebrow}>
            <TerminalSquare size={14} /> {labels.eyebrow}
          </span>
          <h1>{labels.title}</h1>
          <p>{labels.description}</p>
        </div>
        <div className={styles.modeCard}>
          <span className={styles.statusDot} aria-hidden="true" />
          <div>
            <strong>
              {sessionStatus === "authenticated"
                ? labels.personalMode
                : labels.publicMode}
            </strong>
            <small>
              {sessionStatus === "authenticated"
                ? labels.personalDetail
                : labels.publicDetail}
            </small>
          </div>
          {sessionStatus !== "authenticated" && (
            <Link href={`/login?callbackUrl=${encodeURIComponent("/console")}`}>
              <UserRound size={14} /> {labels.signIn}
            </Link>
          )}
        </div>
      </section>

      <section className={styles.workspace} aria-label={labels.consoleLabel}>
        <div className={styles.terminalBar}>
          <div><i /><i /><i /></div>
          <span>magic-brain://console</span>
          <span>{labels.readOnly}</span>
        </div>
        <form className={styles.commandForm} onSubmit={execute}>
          <label htmlFor="console-command">
            <Command size={18} aria-hidden="true" />
            <span className={styles.prompt}>›</span>
            <span className="sr-only">{labels.commandLabel}</span>
          </label>
          <input
            ref={inputRef}
            id="console-command"
            value={command}
            onChange={(event) => setCommand(event.target.value)}
            onKeyDown={onInputKeyDown}
            disabled={running}
            autoComplete="off"
            spellCheck={false}
            maxLength={500}
            aria-describedby="console-hint"
            aria-autocomplete="list"
            placeholder={labels.placeholder}
          />
          {running ? (
            <button
              type="button"
              className={styles.cancelButton}
              onClick={() => controllerRef.current?.abort()}
            >
              <Square size={14} /> {labels.cancel}
            </button>
          ) : (
            <button type="submit" className={styles.runButton}>
              <Play size={14} /> {labels.run}
            </button>
          )}
        </form>
        <p id="console-hint" className={styles.hint}>
          {labels.hint}
        </p>
        {!running && suggestions.length > 0 && (
          <div className={styles.suggestions} role="list" aria-label={labels.suggestions}>
            {suggestions.map((example) => (
              <button type="button" onClick={() => selectExample(example)} key={example}>
                {example}
              </button>
            ))}
          </div>
        )}
        <div className={styles.liveStatus} role="status" aria-live="polite">
          {running ? (
            <>
              <LoaderCircle className={styles.spinner} size={15} />
              {labels.running}
            </>
          ) : entries[0] ? (
            entries[0].status === "success"
              ? labels.complete
              : entries[0].status === "cancelled"
                ? labels.cancelled
                : labels.failed
          ) : (
            labels.ready
          )}
        </div>
      </section>

      <section className={styles.results} aria-label={labels.results}>
        {entries.length === 0 ? (
          <div className={styles.empty}>
            <TerminalSquare size={28} />
            <h2>{labels.emptyTitle}</h2>
            <p>{labels.emptyBody}</p>
          </div>
        ) : (
          entries.map((entry) => (
            <article className={styles.entry} key={entry.id}>
              <header>
                <code><span>›</span> {entry.command}</code>
                <div>
                  {entry.terminalCommand && (
                    <button
                      type="button"
                      onClick={() =>
                        copyText(entry.terminalCommand!, `${entry.id}-command`)
                      }
                    >
                      {copied === `${entry.id}-command` ? (
                        <Check size={14} />
                      ) : (
                        <Clipboard size={14} />
                      )}
                      {labels.copyCommand}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      copyText(
                        JSON.stringify(entry.result, null, 2),
                        `${entry.id}-response`,
                      )
                    }
                  >
                    {copied === `${entry.id}-response` ? (
                      <Check size={14} />
                    ) : (
                      <Clipboard size={14} />
                    )}
                    {labels.copyResponse}
                  </button>
                </div>
              </header>
              <div className={`${styles.output} ${styles[entry.status]}`}>
                {entry.json || entry.status !== "success" ? (
                  <pre>{JSON.stringify(entry.result, null, 2)}</pre>
                ) : (
                  <RichResult view={entry.view} value={entry.result} locale={locale} />
                )}
              </div>
            </article>
          ))
        )}
      </section>

      <aside className={styles.resources}>
        <div>
          <strong>{labels.terminalCli}</strong>
          <code>npm run build --prefix tools/magic-brain-cli</code>
        </div>
        <div>
          <strong>{labels.remoteMcp}</strong>
          <code>{mcpUrl}</code>
        </div>
        <Link href="/developers">{labels.developerHub}</Link>
      </aside>
    </main>
  );
}

async function executePlan(
  plan: ConsolePlan,
  signal: AbortSignal,
  locale: "en" | "es",
  authenticated: boolean,
) {
  if (plan.kind === "help") {
    return { commands: CONSOLE_EXAMPLES, note: copy(locale).helpNote };
  }
  if (plan.kind === "mcp-status") return request("/api/console/status", signal, locale);
  if (plan.kind === "api-status") {
    const openapi = await request("/api/v1/openapi.json", signal, locale);
    return apiSummary(openapi);
  }
  if (plan.kind === "health" || plan.kind === "doctor") {
    const [openapi, mcp] = await Promise.all([
      request("/api/v1/openapi.json", signal, locale),
      request("/api/console/status", signal, locale),
    ]);
    return {
      status: "ok",
      api: apiSummary(openapi),
      mcp,
      authentication: authenticated ? "signed_in" : "anonymous",
      ...(plan.kind === "doctor"
        ? {
            capabilities: {
              publicResearch: true,
              personalReads: authenticated,
              mutations: false,
            },
          }
        : {}),
    };
  }
  if (plan.kind !== "request") throw new Error(copy(locale).unexpected);
  const url = new URL(plan.path, window.location.origin);
  for (const [name, value] of Object.entries(plan.query ?? {})) {
    url.searchParams.set(name, value);
  }
  return request(url.toString(), signal, locale, {
    method: plan.method,
    ...(plan.body === undefined ? {} : { body: JSON.stringify(plan.body) }),
  });
}

async function request(
  url: string,
  outerSignal: AbortSignal,
  locale: "en" | "es",
  init: RequestInit = {},
) {
  const timeout = new AbortController();
  const timer = window.setTimeout(() => timeout.abort(), 12_000);
  const abort = () => timeout.abort();
  outerSignal.addEventListener("abort", abort, { once: true });
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        Accept: "application/json",
        "Accept-Language": locale,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      credentials: "same-origin",
      signal: timeout.signal,
    });
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (contentLength > CONSOLE_MAX_OUTPUT_CHARS) {
      throw new Error(copy(locale).tooLarge);
    }
    const text = await response.text();
    if (text.length > CONSOLE_MAX_OUTPUT_CHARS) {
      throw new Error(copy(locale).tooLarge);
    }
    const body = text ? (JSON.parse(text) as unknown) : null;
    if (!response.ok) {
      const record = asRecord(body);
      const nested = asRecord(record.error);
      const message =
        typeof nested.message === "string"
          ? nested.message
          : typeof record.error === "string"
            ? record.error
            : `${copy(locale).requestFailed} (${response.status})`;
      throw new Error(message);
    }
    return body;
  } finally {
    window.clearTimeout(timer);
    outerSignal.removeEventListener("abort", abort);
  }
}

function apiSummary(value: unknown) {
  const document = asRecord(value);
  const info = asRecord(document.info);
  const paths = asRecord(document.paths);
  return {
    status: "ok",
    specification: document.openapi,
    version: info.version,
    endpoints: Object.keys(paths).length,
  };
}

function RichResult({
  view,
  value,
  locale,
}: {
  view: ConsoleView;
  value: unknown;
  locale: "en" | "es";
}) {
  const labels = copy(locale);
  if (view === "help") {
    return (
      <div className={styles.helpGrid}>
        {CONSOLE_EXAMPLES.map((example) => <code key={example}>{example}</code>)}
      </div>
    );
  }
  if (view === "status") {
    return <StatusResult value={asRecord(value)} locale={locale} />;
  }
  const root = asRecord(value);
  const data = root.data ?? value;
  const record = asRecord(data);
  const list =
    Array.isArray(data)
      ? data
      : firstArray(record, ["cards", "prices", "sets", "briefs", "signals", "lists", "nodes"]);

  if (view === "profile") {
    return <StatusResult value={record} locale={locale} />;
  }
  if (view === "card" && list) {
    return (
      <div className={styles.objectResult}>
        <KeyValues value={record} locale={locale} />
        <div className={styles.resultGrid}>
          {list.slice(0, 12).map((item, index) => (
            <ResultCard item={item} index={index} locale={locale} key={stableKey(item, index)} />
          ))}
        </div>
      </div>
    );
  }
  if (list) {
    const series = view === "history" ? findSeries(record) : [];
    return (
      <div className={styles.objectResult}>
        {series.length > 1 && <MiniChart values={series} />}
        <div className={styles.resultGrid}>
          {list.slice(0, 24).map((item, index) => (
            <ResultCard item={item} index={index} locale={locale} key={stableKey(item, index)} />
          ))}
          {list.length === 0 && <p>{labels.noResults}</p>}
        </div>
      </div>
    );
  }
  if (view === "portfolio") {
    return <PortfolioResult value={record} locale={locale} />;
  }
  const chart = findSeries(record);
  return (
    <div className={styles.objectResult}>
      {chart.length > 1 && <MiniChart values={chart} />}
      <KeyValues value={record} locale={locale} />
    </div>
  );
}

function StatusResult({
  value,
  locale,
}: {
  value: Record<string, unknown>;
  locale: "en" | "es";
}) {
  const items = Object.entries(value).flatMap(([key, item]) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      return [{ key, value: item }];
    }
    return Object.entries(asRecord(item))
      .filter(([, nested]) => ["string", "number", "boolean"].includes(typeof nested))
      .map(([nestedKey, nested]) => ({
        key: `${key} ${nestedKey}`,
        value: nested,
      }));
  });
  return (
    <div className={styles.metricGrid}>
      {items.slice(0, 16).map((item) => (
        <div key={item.key}>
          <small>{humanize(item.key)}</small>
          <strong>{formatValue(item.value, locale)}</strong>
        </div>
      ))}
    </div>
  );
}

function ResultCard({
  item,
  index,
  locale,
}: {
  item: unknown;
  index: number;
  locale: "en" | "es";
}) {
  const record = asRecord(item);
  const title =
    stringValue(record.name) ??
    stringValue(record.cardName) ??
    stringValue(record.title) ??
    stringValue(record.code) ??
    `${copy(locale).result} ${index + 1}`;
  const subtitle = [
    stringValue(record.setName),
    stringValue(record.setCode),
    stringValue(record.rarity),
    stringValue(record.date),
  ].filter(Boolean).join(" · ");
  const price =
    numericValue(record.priceEur) ??
    numericValue(record.amount) ??
    numericValue(record.currentPrice) ??
    numericValue(record.marketValue);
  return (
    <article className={styles.resultCard}>
      <div>
        <strong>{title}</strong>
        {subtitle && <small>{subtitle}</small>}
      </div>
      {price !== undefined && (
        <span className={styles.price}>
          {new Intl.NumberFormat(locale, {
            style: "currency",
            currency: "EUR",
          }).format(price)}
        </span>
      )}
      <KeyValues value={record} locale={locale} compact />
    </article>
  );
}

function PortfolioResult({
  value,
  locale,
}: {
  value: Record<string, unknown>;
  locale: "en" | "es";
}) {
  const summary = asRecord(value.summary);
  const series = findSeries(value);
  return (
    <div className={styles.portfolioResult}>
      <div className={styles.metricGrid}>
        {Object.entries(summary).slice(0, 8).map(([key, item]) => (
          <div key={key}>
            <small>{humanize(key)}</small>
            <strong>{formatValue(item, locale)}</strong>
          </div>
        ))}
      </div>
      {series.length > 1 && <MiniChart values={series} />}
      <KeyValues value={value} locale={locale} />
    </div>
  );
}

function KeyValues({
  value,
  locale,
  compact = false,
}: {
  value: Record<string, unknown>;
  locale: "en" | "es";
  compact?: boolean;
}) {
  const entries = Object.entries(value)
    .filter(([, item]) =>
      ["string", "number", "boolean"].includes(typeof item),
    )
    .slice(0, compact ? 4 : 12);
  return (
    <dl className={compact ? styles.compactValues : styles.keyValues}>
      {entries.map(([key, item]) => (
        <div key={key}>
          <dt>{humanize(key)}</dt>
          <dd>{formatValue(item, locale)}</dd>
        </div>
      ))}
    </dl>
  );
}

function MiniChart({ values }: { values: number[] }) {
  const width = 520;
  const height = 120;
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = maximum - minimum || 1;
  const points = values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * width;
      const y = height - ((value - minimum) / range) * (height - 12) - 6;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg className={styles.chart} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Value trend">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="3" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function firstArray(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) if (Array.isArray(record[key])) return record[key];
  return undefined;
}

function findSeries(record: Record<string, unknown>) {
  const candidates = [
    record.history,
    record.prices,
    asRecord(record.forecast).points,
  ];
  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue;
    const values = candidate
      .map((item) => {
        const point = asRecord(item);
        return (
          numericValue(point.value) ??
          numericValue(point.amount) ??
          numericValue(point.marketValue) ??
          numericValue(point.median)
        );
      })
      .filter((item): item is number => item !== undefined);
    if (values.length > 1) return values;
  }
  return [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numericValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value ? value : undefined;
}

function stableKey(value: unknown, index: number) {
  const record = asRecord(value);
  return String(record.id ?? record.cardId ?? record.code ?? record.date ?? index);
}

function humanize(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/^./, (character) => character.toUpperCase());
}

function formatValue(value: unknown, locale: "en" | "es") {
  if (typeof value === "number") {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return typeof value === "string" ? value : "—";
}

function sanitizeError(error: unknown, locale: "en" | "es") {
  const message = error instanceof Error ? error.message : copy(locale).unexpected;
  return message
    .replace(/mb_(?:live|test)_[A-Za-z0-9_-]+/g, "[REDACTED]")
    .replace(/mba_[A-Za-z0-9_-]+/g, "[REDACTED]")
    .slice(0, 500);
}

function track(
  category: ConsoleCategory,
  outcome: "success" | "error" | "cancelled",
  locale: "en" | "es",
) {
  const payload = JSON.stringify({ category, outcome, locale });
  if (navigator.sendBeacon) {
    navigator.sendBeacon(
      "/api/console/events",
      new Blob([payload], { type: "application/json" }),
    );
  } else {
    void fetch("/api/console/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    });
  }
}

function copy(locale: "en" | "es") {
  return locale === "es"
    ? {
        eyebrow: "Consola web",
        title: "Magic Brain Console",
        description:
          "Consulta cartas, mercado y tu cartera directamente desde la web. Comandos seguros, respuestas visuales y ningún secreto en el navegador.",
        personalMode: "Modo personal",
        publicMode: "Modo público",
        personalDetail: "Lecturas de cuenta habilitadas",
        publicDetail: "Investigación anónima habilitada",
        signIn: "Iniciar sesión",
        readOnly: "Solo lectura",
        consoleLabel: "Consola Magic Brain",
        commandLabel: "Comando de consola",
        placeholder: "Escribe help o busca una carta…",
        run: "Ejecutar",
        cancel: "Cancelar",
        hint: "↑/↓ historial · Tab autocompleta · añade --json para ver JSON",
        suggestions: "Comandos sugeridos",
        running: "Ejecutando comando…",
        complete: "Comando completado",
        failed: "El comando falló",
        ready: "Consola lista",
        cancelled: "Comando cancelado",
        results: "Resultados de consola",
        emptyTitle: "Empieza con un comando",
        emptyBody: "Prueba help, doctor o uno de los ejemplos sugeridos.",
        copyCommand: "Copiar CLI",
        copyResponse: "Copiar respuesta",
        terminalCli: "CLI instalable",
        remoteMcp: "MCP remoto",
        developerHub: "Abrir Developer Hub",
        signInRequired:
          "Inicia sesión en Magic Brain para ejecutar comandos personales.",
        unexpected: "Se produjo un error inesperado.",
        requestFailed: "La solicitud falló",
        tooLarge: "La respuesta supera el límite seguro de la consola.",
        helpNote:
          "Esta consola web es de solo lectura. La CLI instalable ofrece automatización adicional.",
        noResults: "No hay resultados.",
        result: "Resultado",
      }
    : {
        eyebrow: "Web console",
        title: "Magic Brain Console",
        description:
          "Query cards, markets, and your portfolio directly on the web. Safe commands, visual answers, and no browser secrets.",
        personalMode: "Personal mode",
        publicMode: "Public mode",
        personalDetail: "Account reads enabled",
        publicDetail: "Anonymous research enabled",
        signIn: "Sign in",
        readOnly: "Read only",
        consoleLabel: "Magic Brain Console",
        commandLabel: "Console command",
        placeholder: "Type help or search for a card…",
        run: "Run",
        cancel: "Cancel",
        hint: "↑/↓ history · Tab completes · add --json for raw JSON",
        suggestions: "Suggested commands",
        running: "Running command…",
        complete: "Command complete",
        failed: "Command failed",
        ready: "Console ready",
        cancelled: "Command cancelled",
        results: "Console results",
        emptyTitle: "Start with a command",
        emptyBody: "Try help, doctor, or one of the suggested examples.",
        copyCommand: "Copy CLI",
        copyResponse: "Copy response",
        terminalCli: "Installable CLI",
        remoteMcp: "Remote MCP",
        developerHub: "Open Developer Hub",
        signInRequired:
          "Sign in to Magic Brain to run personal commands.",
        unexpected: "An unexpected error occurred.",
        requestFailed: "Request failed",
        tooLarge: "The response exceeds the console safety limit.",
        helpNote:
          "This web console is read-only. The installable CLI provides additional automation.",
        noResults: "No results.",
        result: "Result",
      };
}
