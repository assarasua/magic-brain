"use client";

import {
  ArrowRight,
  AtSign,
  BookOpen,
  Building2,
  Check,
  ChevronRight,
  Clipboard,
  Code2,
  ExternalLink,
  Gauge,
  HeartHandshake,
  KeyRound,
  LifeBuoy,
  LoaderCircle,
  Menu,
  RefreshCw,
  ShieldCheck,
  Signpost,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { signIn, useSession } from "next-auth/react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { MagicBrainLogo } from "@/components/brand-logo";
import { LanguageToggle, useLanguage } from "@/components/language-provider";
import styles from "./developers.module.css";

export type DeveloperEndpoint = {
  method: string;
  path: string;
  operationId: string;
  summary: string;
  auth: "session" | "optional-key" | "scoped-key";
  parameters: Array<{
    name: string;
    location: string;
    required: boolean;
    description?: string;
    type: string;
    constraint?: string;
  }>;
};

type ApiKey = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  tier: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

type ApiEnvelope<T> = {
  data?: T;
  error?: { message?: string };
};

const examples = {
  curl: `curl "https://magicbrain.es/api/v1/cards?q=lotus&limit=10" \\
  -H "Authorization: Bearer $MAGIC_BRAIN_API_KEY"`,
  javascript: `const response = await fetch(
  "https://magicbrain.es/api/v1/cards?q=lotus&limit=10",
  { headers: { Authorization: \`Bearer \${process.env.MAGIC_BRAIN_API_KEY}\` } }
);

if (!response.ok) throw new Error(\`API error: \${response.status}\`);
const { data, meta } = await response.json();`,
  python: `import os
import requests

response = requests.get(
    "https://magicbrain.es/api/v1/cards",
    params={"q": "lotus", "limit": 10},
    headers={"Authorization": f"Bearer {os.environ['MAGIC_BRAIN_API_KEY']}"},
    timeout=15,
)
response.raise_for_status()
cards = response.json()["data"]`,
};

const navItems = [
  ["overview", "Overview"],
  ["web-mcp", "WebMCP"],
  ["mcp", "MCP setup"],
  ["reference", "API reference"],
  ["examples", "Examples"],
  ["keys", "API keys"],
  ["support", "Support"],
  ["policies", "Policies"],
] as const;

const mcpEndpoint = "https://magic-brain-mcp.assarasua.workers.dev/mcp";

const mcpInstallers = [
  {
    id: "claude",
    name: "Claude",
    requirement: "Free, Pro, Max, Team, or Enterprise",
    description:
      "Add a custom connector in Customize > Connectors. Connect anonymously or approve OAuth for personal tools; writes require confirmation.",
    snippet: mcpEndpoint,
    source: "https://claude.com/docs/connectors/custom/remote-mcp",
  },
  {
    id: "cursor",
    name: "Cursor",
    requirement: "Cursor with MCP support",
    description:
      "Save as .cursor/mcp.json for one project or ~/.cursor/mcp.json for all projects.",
    snippet: `{
  "mcpServers": {
    "magic-brain": {
      "url": "${mcpEndpoint}"
    }
  }
}`,
    source: "https://cursor.com/docs/mcp",
  },
  {
    id: "vscode",
    name: "VS Code + Copilot",
    requirement: "VS Code 1.99+ and Copilot access",
    description:
      "Save as .vscode/mcp.json. Managed Copilot seats need the organization MCP policy enabled.",
    snippet: `{
  "servers": {
    "magic-brain": {
      "type": "http",
      "url": "${mcpEndpoint}"
    }
  }
}`,
    source: "https://code.visualstudio.com/docs/copilot/customization/mcp-servers",
  },
  {
    id: "chatgpt",
    name: "ChatGPT",
    requirement: "Plus, Pro, Business, Enterprise, or Education on the web; workspace policies apply",
    description:
      "Enable Developer mode in Settings > Security and login. In ChatGPT Plugins, select + to create an app with this endpoint. Select it from the conversation’s Developer mode menu. Public reads are anonymous; authorize OAuth for personal tools.",
    snippet: mcpEndpoint,
    source: "https://developers.openai.com/api/docs/guides/developer-mode",
  },
  {
    id: "grok",
    name: "Grok",
    requirement: "Custom MCP connectors where available in your account",
    description:
      "Open grok.com/connectors, choose New Connector > Custom, and enter this hosted URL. Complete authentication when required, then ask Grok to use the discovered Magic Brain tools.",
    snippet: mcpEndpoint,
    source: "https://docs.x.ai/grok/connectors",
  },
  {
    id: "gemini",
    name: "Gemini CLI",
    requirement: "Supported enterprise access or paid API keys; free/Google One CLI users have an Antigravity migration path",
    description:
      "Add the HTTP server with this command, then inspect it using /mcp. This is a CLI route, not a verified setup for the Gemini web/mobile chat.",
    snippet: `gemini mcp add --transport http magic-brain ${mcpEndpoint}`,
    source: "https://geminicli.com/docs/tools/mcp-server/",
  },
  {
    id: "codex",
    name: "Codex",
    requirement: "A Codex client with remote MCP support",
    description:
      "Add this table to ~/.codex/config.toml without replacing other settings. Refresh the MCP connection. Run codex mcp login magic_brain only when you want to authorize personal tools.",
    snippet: `[mcp_servers.magic_brain]\nurl = "${mcpEndpoint}"`,
    source: "https://learn.chatgpt.com/docs/extend/mcp",
  },
  {
    id: "openai",
    name: "OpenAI API",
    requirement: "Responses API access and an OpenAI API key",
    description:
      "Add this remote MCP tool to a Responses API request. The OpenAI key is not sent to Magic Brain.",
    snippet: `{
  "type": "mcp",
  "server_label": "magic_brain",
  "server_description": "Read-only Magic card, price, rules, and source-cited Magic Brain product research.",
  "server_url": "${mcpEndpoint}"
}`,
    source: "https://developers.openai.com/api/docs/guides/tools-connectors-mcp",
  },
] as const;

const mcpToolGroups = [
  {
    name: "Card & price data",
    summary: "Resolve exact printings, inspect catalogue metadata, and compare sourced EUR observations.",
    tools: ["search_cards", "get_card", "get_latest_prices", "get_price_history", "get_market_movers"],
  },
  {
    name: "Sets & opportunities",
    summary: "Browse normalized sets and retrieve transparent, bounded latest-set research signals.",
    tools: ["list_sets", "get_latest_set_opportunities", "search_opportunity_graph"],
  },
  {
    name: "Predictions & briefs",
    summary: "Build unsaved scenarios and retrieve immutable price-derived briefs.",
    tools: ["predict_set_growth", "build_portfolio_scenario", "get_latest_market_brief", "get_market_brief_by_date", "list_market_briefs"],
  },
  {
    name: "Personal intelligence",
    summary: "Opt-in OAuth tools for an owned collection and preference-derived insights.",
    tools: ["get_personalized_opportunities", "get_predict_recommendation", "get_portfolio_intelligence", "list_portfolio_lists", "get_portfolio_list"],
  },
  {
    name: "Account actions",
    summary: "OAuth tools that require explicit confirmation before changing a portfolio, list, or watchlist.",
    tools: ["add_to_portfolio", "add_to_watchlist", "remove_from_watchlist", "create_portfolio_list", "rename_portfolio_list", "remove_portfolio_holdings"],
  },
  {
    name: "Comprehensive Rules",
    summary: "Search pinned official excerpts and build clearly non-authoritative explanations from citations.",
    tools: ["search_rules", "ask_rules"],
  },
  {
    name: "Card effects & interactions",
    summary: "Combine exact Oracle text, dated card rulings, and official rules to explain a game situation.",
    tools: ["search_card_effects", "get_card_rules", "explain_card_interaction"],
  },
  {
    name: "Product & strategy",
    summary: "Retrieve source-cited diligence evidence while preserving fact, hypothesis, roadmap, and unknown status.",
    tools: ["search_product_knowledge", "get_product_context", "ask_product_question"],
  },
] as const;

function CodeSample({ es = false }: { es?: boolean }) {
  const [language, setLanguage] = useState<keyof typeof examples>("curl");
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(examples[language]);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className={styles.codePanel}>
      <div className={styles.codeTabs} role="tablist" aria-label="Code language">
        {(Object.keys(examples) as Array<keyof typeof examples>).map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={language === item}
            className={language === item ? styles.activeTab : ""}
            onClick={() => setLanguage(item)}
          >
            {item === "javascript" ? "JavaScript" : item[0].toUpperCase() + item.slice(1)}
          </button>
        ))}
        <button type="button" className={styles.copyButton} onClick={copy}>
          {copied ? <Check size={14} /> : <Clipboard size={14} />}
          {copied ? (es ? "Copiado" : "Copied") : (es ? "Copiar" : "Copy")}
        </button>
      </div>
      <pre tabIndex={0}><code>{examples[language]}</code></pre>
    </div>
  );
}

function McpInstall({ es }: { es: boolean }) {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (id: string, snippet: string) => {
    await navigator.clipboard.writeText(snippet);
    setCopied(id);
    window.setTimeout(() => setCopied((current) => (current === id ? null : current)), 1600);
  };

  return (
    <>
      <div className={styles.mcpCallout}>
        <ShieldCheck size={20} />
        <div>
          <strong>{es ? "Conector remoto activo · anónimo por defecto, acceso opcional" : "Live remote connector · anonymous by default, optional sign-in"}</strong>
          <p>
            {es ? "Usa la URL HTTPS exacta. Es un endpoint Streamable HTTP alojado. La investigación pública no necesita cuenta; las herramientas personales usan consentimiento OAuth en clientes compatibles." : "Use the exact HTTPS URL below. It is a hosted Streamable HTTP endpoint, separate from local self-hosting. Public research needs no account; personal tools use OAuth consent in supported clients."}
          </p>
        </div>
        <code>{mcpEndpoint}</code>
        <button type="button" onClick={() => void copy("endpoint", mcpEndpoint)}>
          {copied === "endpoint" ? <Check size={14} /> : <Clipboard size={14} />}
          {copied === "endpoint" ? (es ? "Copiada" : "Copied") : (es ? "Copiar URL" : "Copy URL")}
        </button>
      </div>

      <div className={styles.mcpGrid}>
        {mcpInstallers.map((installer) => (
          <article className={styles.mcpCard} key={installer.id}>
            <div className={styles.mcpCardHeading}>
              <div>
                <h3>{installer.name}</h3>
                <span>{installer.requirement}</span>
              </div>
              <a href={installer.source} target="_blank" rel="noreferrer" aria-label={`${installer.name} official MCP documentation`}>
                {es ? "Documentación oficial" : "Official docs"} <ExternalLink size={12} />
              </a>
            </div>
            <p>{installer.description}</p>
            <div className={styles.mcpSnippet}>
              <pre tabIndex={0}><code>{installer.snippet}</code></pre>
              <button
                type="button"
                aria-label={`Copy ${installer.name} configuration`}
                onClick={() => void copy(installer.id, installer.snippet)}
              >
                {copied === installer.id ? <Check size={14} /> : <Clipboard size={14} />}
                {copied === installer.id ? (es ? "Copiado" : "Copied") : (es ? "Copiar" : "Copy")}
              </button>
            </div>
          </article>
        ))}
      </div>

      <div className={styles.toolCatalogue}>
        <div className={styles.toolCatalogueHeading}>
          <div>
            <span>{mcpToolGroups.reduce((total, group) => total + group.tools.length, 0)} {es ? "herramientas de investigación y cuenta" : "research and account tools"}</span>
            <h3>{es ? "Evidencia y acciones de cuenta confirmadas." : "Evidence plus confirmed account actions."}</h3>
            <p>{es ? "Explora las herramientas y consulta la referencia canónica para ver esquemas, resultados, ejemplos, límites y errores." : "Explore the surface at a glance, then use the canonical reference for exact schemas, outputs, examples, caveats, and errors."}</p>
          </div>
          <a href="https://github.com/assarasua/magic-brain/blob/main/docs/mcp-tools.md" target="_blank" rel="noreferrer">
            {es ? "Abrir referencia de herramientas" : "Open the tool reference"} <ArrowRight size={14} />
          </a>
        </div>
        <div className={styles.toolGroupGrid}>
          {mcpToolGroups.map((group, index) => (
            <article className={styles.toolGroup} key={group.name}>
              <div className={styles.toolGroupNumber} aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </div>
              <h4>{group.name === "Card effects & interactions" && es ? "Efectos e interacciones de cartas" : group.name === "Personal intelligence" && es ? "Inteligencia personal" : group.name}</h4>
              <p>{group.name === "Card effects & interactions" && es ? "Combina el texto Oracle exacto, resoluciones fechadas y reglas oficiales para explicar una situación de juego." : group.name === "Personal intelligence" && es ? "Herramientas OAuth opcionales para consultar una colección propia e información derivada de preferencias." : group.summary}</p>
              <ul aria-label={`${group.name} tools`}>
                {group.tools.map((tool) => <li key={tool}><code>{tool}</code></li>)}
              </ul>
            </article>
          ))}
        </div>
      </div>

      <div className={styles.mcpGuideLink}>
        <div>
          <strong>{es ? "¿Necesitas pasos exactos o solucionar problemas?" : "Need exact steps or troubleshooting?"}</strong>
          <p>{es ? "La guía del repositorio incluye requisitos, restricciones, comprobaciones, transportes y configuración local." : "Plan requirements, admin restrictions, health checks, transports, and local setup are covered in the repository guide."}</p>
        </div>
        <a href="https://github.com/assarasua/magic-brain/blob/main/docs/mcp-installation.md" target="_blank" rel="noreferrer">
          {es ? "Leer guía de instalación" : "Read the installation guide"} <ArrowRight size={14} />
        </a>
      </div>
    </>
  );
}

function EndpointReference({ endpoints, es }: { endpoints: DeveloperEndpoint[]; es: boolean }) {
  return (
    <div className={styles.endpointList}>
      {endpoints.map((endpoint) => (
        <details className={styles.endpoint} key={endpoint.operationId}>
          <summary>
            <span className={`${styles.method} ${styles[endpoint.method.toLowerCase()]}`}>
              {endpoint.method}
            </span>
            <code>{endpoint.path}</code>
            <span>{endpoint.summary}</span>
            <ChevronRight className={styles.chevron} size={17} />
          </summary>
          <div className={styles.endpointBody}>
            <div className={styles.endpointMeta}>
              <span>
                {endpoint.auth === "session"
                  ? (es ? "Requiere sesión de Magic Brain" : "Magic Brain account session required")
                  : endpoint.auth === "scoped-key"
                    ? (es ? "Requiere token OAuth con permisos o clave API" : "Scoped OAuth token or API key required")
                    : (es ? "Acceso anónimo o clave API Bearer" : "Anonymous access or Bearer API key")}
              </span>
              <a href={`/api/v1/openapi.json#/${endpoint.operationId}`}>
                OpenAPI <ExternalLink size={12} />
              </a>
            </div>
            {endpoint.parameters.length > 0 ? (
              <div className={styles.parameters}>
                {endpoint.parameters.map((parameter) => (
                  <div key={`${endpoint.operationId}-${parameter.location}-${parameter.name}`}>
                    <code>{parameter.name}</code>
                    <span>{parameter.location}</span>
                    <span>{parameter.type}</span>
                    <p>
                      {parameter.description ??
                        [parameter.required ? "Required." : "Optional.", parameter.constraint]
                          .filter(Boolean)
                          .join(" ")}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className={styles.noParameters}>{es ? "Sin parámetros." : "No parameters."}</p>
            )}
            {endpoint.method === "POST" && endpoint.path === "/prices/latest" && (
              <div className={styles.bodyHint}>
                JSON body: <code>{`{"cardIds":["<card-uuid>"]}`}</code> · 1–100 card IDs
              </div>
            )}
          </div>
        </details>
      ))}
    </div>
  );
}

function KeyManager({ es }: { es: boolean }) {
  const dateLocale = es ? "es-ES" : "en-US";
  const { status } = useSession();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [name, setName] = useState("");
  const [personalRead, setPersonalRead] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const loadKeys = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/v1/api-keys", { cache: "no-store" });
      const result = (await response.json()) as ApiEnvelope<ApiKey[]>;
      if (!response.ok) throw new Error(result.error?.message ?? "Unable to load API keys");
      setKeys(result.data ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load API keys");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;
    const controller = new AbortController();
    fetch("/api/v1/api-keys", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const result = (await response.json()) as ApiEnvelope<ApiKey[]>;
        if (!response.ok) throw new Error(result.error?.message ?? "Unable to load API keys");
        return result.data ?? [];
      })
      .then(setKeys)
      .catch((error: Error) => {
        if (error.name !== "AbortError") setMessage(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [status]);

  const createKey = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/v1/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          scopes: personalRead
            ? ["data:read", "portfolio:read", "lists:read", "profile:read"]
            : ["data:read"],
        }),
      });
      const result = (await response.json()) as ApiEnvelope<ApiKey & { secret: string }>;
      if (!response.ok || !result.data) {
        throw new Error(result.error?.message ?? "Unable to create API key");
      }
      setSecret(result.data.secret);
      setName("");
      setPersonalRead(false);
      await loadKeys();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create API key");
    } finally {
      setLoading(false);
    }
  };

  const revokeKey = async (key: ApiKey) => {
    if (!window.confirm(`Revoke “${key.name}”? Requests using it will stop immediately.`)) return;
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`/api/v1/api-keys/${key.id}`, { method: "DELETE" });
      const result = (await response.json()) as ApiEnvelope<{ revoked: boolean }>;
      if (!response.ok) throw new Error(result.error?.message ?? "Unable to revoke API key");
      await loadKeys();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to revoke API key");
    } finally {
      setLoading(false);
    }
  };

  if (status === "loading") {
    return <div className={styles.keyState}><LoaderCircle className="spin" size={20} /> {es ? "Comprobando tu cuenta…" : "Checking your account…"}</div>;
  }

  if (status !== "authenticated") {
    return (
      <div className={styles.signInCard}>
        <div><KeyRound size={23} /><span>300 requests per minute</span></div>
        <h3>{es ? "Crea una clave API gratuita" : "Create a free API key"}</h3>
        <p>{es ? "Inicia sesión para crear, consultar y revocar claves. Los secretos se muestran una sola vez y solo se guardan como hashes." : "Sign in to create, inspect, and revoke keys. Secrets are shown once and stored only as hashes."}</p>
        <button type="button" onClick={() => void signIn("google", { redirectTo: "/developers#keys" })}>
          {es ? "Iniciar sesión para gestionar claves" : "Sign in to manage keys"} <ArrowRight size={15} />
        </button>
      </div>
    );
  }

  return (
    <div className={styles.keyManager}>
      <form onSubmit={createKey}>
        <label htmlFor="key-name">{es ? "Nombre de la clave" : "Key name"}</label>
        <div>
          <input
            id="key-name"
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            placeholder={es ? "Web de producción" : "Production website"}
            disabled={loading}
          />
          <button type="submit" disabled={loading || !name.trim()}>
            {loading ? <LoaderCircle className="spin" size={16} /> : <KeyRound size={16} />}
            {es ? "Crear clave" : "Create key"}
          </button>
        </div>
        <label>
          <input
            type="checkbox"
            checked={personalRead}
            onChange={(event) => setPersonalRead(event.target.checked)}
            disabled={loading}
          />
          {es ? "Permitir lectura del portfolio, listas y perfil propios" : "Allow owned portfolio, list, and profile reads"}
        </label>
        <small>{es ? "Usa una clave distinta por entorno. Hasta 10 claves activas. Esta opción no permite escritura." : "Use a distinct key per environment. Up to 10 active keys. This option grants no writes."}</small>
      </form>

      {secret && (
        <div className={styles.secretNotice} role="status">
          <ShieldCheck size={20} />
          <div>
            <strong>{es ? "Copia ahora tu nueva clave" : "Copy your new key now"}</strong>
            <p>{es ? "No se podrá volver a mostrar." : "It cannot be displayed again."}</p>
            <code>{secret}</code>
          </div>
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(secret);
              setMessage("API key copied");
            }}
          >
            <Clipboard size={15} /> {es ? "Copiar" : "Copy"}
          </button>
        </div>
      )}

      {message && <p className={styles.keyMessage} role="status">{message}</p>}
      <div className={styles.keyList} aria-live="polite" aria-busy={loading}>
        {keys.map((key) => (
          <article key={key.id} className={key.revokedAt ? styles.revoked : ""}>
            <div>
              <strong>{key.name}</strong>
              <code>{key.prefix}••••••••</code>
            </div>
            <div className={styles.keyDetails}>
              <span>{key.tier}</span>
              <span>{key.scopes.join(", ")}</span>
              <span>{es ? "Creada" : "Created"} {new Date(key.createdAt).toLocaleDateString(dateLocale)}</span>
              <span>{key.lastUsedAt ? `${es ? "Usada" : "Used"} ${new Date(key.lastUsedAt).toLocaleDateString(dateLocale)}` : (es ? "Nunca usada" : "Never used")}</span>
            </div>
            {key.revokedAt ? (
              <span className={styles.revokedLabel}>{es ? "Revocada" : "Revoked"}</span>
            ) : (
              <button type="button" onClick={() => void revokeKey(key)} disabled={loading}>
                <Trash2 size={14} /> {es ? "Revocar" : "Revoke"}
              </button>
            )}
          </article>
        ))}
        {!loading && keys.length === 0 && <p className={styles.emptyKeys}>{es ? "Aún no tienes claves. Crea una para tu primera integración." : "No keys yet. Create one for your first integration."}</p>}
      </div>
    </div>
  );
}

export function DevelopersHub({
  endpoints,
  apiVersion,
}: {
  endpoints: DeveloperEndpoint[];
  apiVersion: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { locale } = useLanguage();
  const es = locale === "es";
  const navLabels: Record<(typeof navItems)[number][0], string> = {
    overview: es ? "Resumen" : "Overview",
    "web-mcp": "WebMCP",
    mcp: es ? "Configurar MCP" : "MCP setup",
    reference: es ? "Referencia API" : "API reference",
    examples: es ? "Ejemplos" : "Examples",
    keys: es ? "Claves API" : "API keys",
    support: es ? "Apoyar" : "Support",
    policies: es ? "Políticas" : "Policies",
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" aria-label="Magic Brain home"><MagicBrainLogo /></Link>
        <nav aria-label={es ? "Navegación para desarrolladores" : "Developer navigation"}>
          {navItems.slice(0, 7).map(([id]) => <Link href={id === "mcp" ? "/mcp" : id === "web-mcp" ? "/webmcp" : `#${id}`} key={id}>{navLabels[id]}</Link>)}
        </nav>
        <div className={styles.headerActions}>
          <LanguageToggle />
          <a href="/api/v1/openapi.json">OpenAPI</a>
          <a className={styles.githubButton} href="https://github.com/assarasua/magic-brain" target="_blank" rel="noreferrer">
            <Code2 size={16} /> GitHub
          </a>
        </div>
        <button
          className={styles.menuButton}
          type="button"
          aria-label={es ? "Mostrar navegación para desarrolladores" : "Toggle developer navigation"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((current) => !current)}
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        {menuOpen && (
          <nav className={styles.mobileNav} aria-label={es ? "Navegación móvil para desarrolladores" : "Mobile developer navigation"}>
            <div className={styles.mobileLanguage}><LanguageToggle /></div>
            {navItems.map(([id]) => <Link href={id === "mcp" ? "/mcp" : id === "web-mcp" ? "/webmcp" : `#${id}`} onClick={() => setMenuOpen(false)} key={id}>{navLabels[id]}</Link>)}
            <a href="https://github.com/assarasua/magic-brain">GitHub <ExternalLink size={13} /></a>
          </nav>
        )}
      </header>

      <section className={styles.hero} id="overview">
        <div className={styles.heroGlow} />
        <div className={styles.heroCopy}>
          <span className={styles.badge}><Sparkles size={13} /> Data API v{apiVersion}</span>
          <h1>{es ? <>Datos para conocer cada carta,<br /><em>creados para builders.</em></> : <>Data to know every card,<br /><em>built for builders.</em></>}</h1>
          <p>{es ? "Consulta impresiones, ediciones e historial de precios en EUR mediante una API estable y consciente de la procedencia. Empieza de forma anónima y crea una clave gratuita cuando necesites más capacidad." : "Query card printings, sets, and EUR price history through a stable, provenance-aware API. Start anonymously, then create a free key when you need more room."}</p>
          <div className={styles.heroActions}>
            <a href="#reference">{es ? "Explorar endpoints" : "Explore endpoints"}</a>
            <Link href="/mcp">{es ? "Guía MCP" : "MCP guide"}</Link>
            <Link href="/webmcp">{es ? "Guía WebMCP" : "WebMCP guide"}</Link>
          </div>
          <div className={styles.heroFacts}>
            <span><Check size={14} /> {es ? "Empieza sin clave" : "No key to start"}</span>
            <span><Check size={14} /> OpenAPI 3.1</span>
            <span><Check size={14} /> CORS enabled</span>
          </div>
        </div>
        <CodeSample es={es} />
      </section>

      <div className={styles.content}>
        <section className={`${styles.section} ${styles.webMcpSection}`} id="web-mcp">
          <div className={styles.sectionHeading}>
            <span>WebMCP {es ? "nativo del navegador" : "browser-native"}</span>
            <h2>{es ? "Navega e investiga con un agente del navegador." : "Navigate and research with a browser agent."}</h2>
            <p>{es ? "Magic Brain registra navegación local y las herramientas públicas de investigación del MCP en navegadores compatibles. Consulta cartas, precios y reglas, o abre destinos concretos. Las herramientas personales se excluyen de esta integración." : "Magic Brain registers local navigation and the MCP’s public research tools in compatible browsers. Retrieve cards, prices and rules, or open fixed destinations. Account tools are excluded from this browser bridge."}</p>
          </div>
          <div className={styles.webMcpCard}>
            <div className={styles.webMcpIcon}><Signpost size={24} /></div>
            <div>
              <span className={styles.previewBadge}>{es ? "Vista previa" : "Early preview"}</span>
              <h3><code>navigate_magic_brain</code></h3>
              <p>{es ? "Magic Brain registra sus herramientas al detectar una API compatible. El navegador o agente puede requerir configuración; las consultas públicas necesitan conexión con el MCP alojado." : "Magic Brain registers tools when it detects a compatible API. Your browser or agent may require setup; public research needs a connection to the hosted MCP."}</p>
            </div>
            <div className={styles.webMcpDetails}>
              <span><Check size={14} /> {es ? "Solo destinos fijos" : "Fixed destinations only"}</span>
              <span><Check size={14} /> {es ? "Navegación e investigación pública" : "Navigation & public research"}</span>
              <span><Check size={14} /> {es ? "Sin acciones de escritura" : "No write actions"}</span>
            </div>
          </div>
          <p><Link className={styles.guideLink} href="/webmcp">{es ? "Leer la guía completa de WebMCP" : "Read the complete WebMCP guide"} <ArrowRight size={15} /></Link></p>
          <p className={styles.webMcpNote}>{es ? "WebMCP es una capacidad experimental del navegador. Para ChatGPT, Claude, Cursor, VS Code e integraciones API, usa el MCP remoto alojado que aparece a continuación." : "WebMCP is an experimental browser capability. For ChatGPT, Claude, Cursor, VS Code, and API integrations today, use the hosted remote MCP below."}</p>
        </section>

        <section className={`${styles.section} ${styles.mcpSection}`} id="mcp">
          <div className={styles.sectionHeading}>
            <span>Remote MCP</span>
            <h2>{es ? "Conecta tu cliente de IA." : "Connect your AI client."}</h2>
            <p>{es ? "Instala las herramientas de Magic Brain en tu cliente habitual. La investigación pública es anónima; OAuth permite consultar tu cuenta y, con confirmación explícita, actualizar portfolio, listas y watchlist." : "Install the live Magic Brain tools in the client you already use. Public research stays anonymous; OAuth can read your account and, with explicit confirmation, update portfolios, lists, and watchlists."}</p>
          </div>
          <p><Link className={styles.guideLink} href="/mcp">{es ? "Guía MCP: conexión, herramientas, reglas y ejemplos" : "MCP guide: setup, tools, rules and examples"} <ArrowRight size={15} /></Link></p>
          <McpInstall es={es} />
        </section>

        <section className={styles.section} id="reference">
          <div className={styles.sectionHeading}>
            <span>{es ? "Referencia" : "Reference"}</span>
            <h2>{es ? "Un contrato siempre actualizado." : "One contract, always current."}</h2>
            <p>{es ? "Esta referencia se genera directamente desde la misma definición OpenAPI que sirve la API." : "This reference is rendered directly from the same OpenAPI definition served by the API."}</p>
          </div>
          <EndpointReference endpoints={endpoints} es={es} />
        </section>

        <section className={styles.section} id="examples">
          <div className={styles.sectionHeading}>
            <span>{es ? "Inicio rápido" : "Quickstart"}</span>
            <h2>{es ? "De cero a los datos en segundos." : "From zero to data in seconds."}</h2>
            <p>{es ? "Las claves Bearer son opcionales para endpoints de solo lectura. Nunca expongas una clave en código del navegador ni en un repositorio público." : "Bearer keys are optional for read-only data endpoints. Never expose a key in browser code or a public repository."}</p>
          </div>
          <CodeSample es={es} />
          <div className={styles.responseNote}>
            <Code2 size={20} />
            <div><strong>{es ? "Respuestas predecibles" : "Predictable envelopes"}</strong><p>{es ? <>Las respuestas correctas usan <code>data</code> y <code>meta</code>. La paginación está en <code>meta.pagination.nextCursor</code>.</> : <>Success responses use <code>data</code> and <code>meta</code>. Cursor pagination is under <code>meta.pagination.nextCursor</code>.</>}</p></div>
          </div>
        </section>

        <section className={styles.section} id="keys">
          <div className={styles.sectionHeading}>
            <span>{es ? "Acceso" : "Access"}</span>
            <h2>{es ? "Tus claves API." : "Your API keys."}</h2>
            <p>{es ? <>Las claves siempre incluyen <code>data:read</code>. Los permisos personales son opcionales y la escritura no está activa por defecto. La revocación es inmediata.</> : <>Keys always carry <code>data:read</code>. Personal scopes are opt-in and writes are not enabled by default. Revocation is immediate.</>}</p>
          </div>
          <KeyManager es={es} />
        </section>

        <section className={styles.section} id="policies">
          <div className={styles.sectionHeading}>
            <span>{es ? "Guía de producción" : "Production guide"}</span>
            <h2>{es ? "Límites, actualización y errores." : "Limits, freshness, and failure modes."}</h2>
          </div>
          <div className={styles.policyGrid}>
            <article><Gauge size={20} /><h3>{es ? "Cuotas" : "Quotas"}</h3><p><strong>{es ? "Anónimo:" : "Anonymous:"}</strong> 30 {es ? "peticiones/minuto por IP" : "requests/minute per IP"}.<br /><strong>{es ? "Clave API:" : "API key:"}</strong> 300 {es ? "peticiones/minuto" : "requests/minute"}.</p><small>{es ? <>Consulta <code>RateLimit-Limit</code>, <code>RateLimit-Remaining</code> y <code>Retry-After</code>. Reduce el ritmo ante un 429.</> : <>Inspect <code>RateLimit-Limit</code>, <code>RateLimit-Remaining</code>, and <code>Retry-After</code>. Back off on 429.</>}</small></article>
            <article><RefreshCw size={20} /><h3>{es ? "Actualización" : "Freshness"}</h3><p>{es ? "Los últimos precios se almacenan 5 minutos. Los metadatos y el historial, 1 hora, permitiendo respuestas antiguas durante la revalidación." : "Latest prices cache for 5 minutes. Metadata and history cache for 1 hour, with stale responses allowed while revalidating."}</p><small>{es ? "Cada precio incluye fuente, fecha de observación, moneda EUR y acabado." : "Every price includes source, observation date, EUR currency, and finish."}</small></article>
            <article><ShieldCheck size={20} /><h3>{es ? "Errores" : "Errors"}</h3><p>{es ? <>Los errores incluyen un <code>error.code</code> estable, un mensaje legible, detalles opcionales y <code>meta.requestId</code>.</> : <>Errors have a stable <code>error.code</code>, human-readable message, optional details, and <code>meta.requestId</code>.</>}</p><small>{es ? "Envía el ID de petición al solicitar ayuda. Reintenta los errores 5xx con espera progresiva." : "Send the request ID when asking for support. Treat 5xx errors as retryable with backoff."}</small></article>
            <article><BookOpen size={20} /><h3>{es ? "Política de versiones" : "Version policy"}</h3><p>{es ? <><code>/api/v1</code> recibe cambios compatibles. Los cambios incompatibles se publican en una nueva ruta principal con notas de migración.</> : <><code>/api/v1</code> receives backward-compatible additions. Breaking changes ship under a new major path with migration notes.</>}</p><small>{es ? "Los campos obsoletos se anunciarán antes de eliminarlos. Sigue las versiones del repositorio." : "Deprecated fields will be announced before removal. Follow repository releases for changes."}</small></article>
          </div>
        </section>

        <section className={`${styles.section} ${styles.donationSection}`} id="support">
          <div className={styles.donationCard}>
            <div className={styles.donationIcon}><HeartHandshake size={25} /></div>
            <div>
              <span>{es ? "Apoya la infraestructura abierta" : "Support open infrastructure"}</span>
              <h2>{es ? "Ayuda a mantener abiertos los datos de Magic." : "Help keep Magic data open."}</h2>
              <p>
                {es ? "Las contribuciones puntuales ayudan a financiar el historial de precios, la capacidad de la API pública, el alojamiento MCP y el mantenimiento de las herramientas abiertas." : "One-time contributions help fund price-history storage, public API capacity, MCP hosting, and continued maintenance of the open-source developer tooling."}
              </p>
              <div className={styles.donationFacts}>
                <span><Check size={13} /> {es ? "Contribución puntual" : "One-time contribution"}</span>
                <span><Check size={13} /> PayPal P2P</span>
                <span><Check size={13} /> {es ? "Sin suscripción" : "No subscription"}</span>
              </div>
            </div>
            <div className={styles.donationActions}>
              <Link href="/donate">
                {es ? "Apoyar Magic Brain" : "Support Magic Brain"} <ArrowRight size={15} />
              </Link>
              <small>{es ? "Las contribuciones no son donaciones benéficas ni desgravan impuestos." : "Contributions are not charitable donations or tax-deductible."}</small>
            </div>
          </div>
        </section>

        <section className={styles.community}>
          <div>
            <span>Open source · AGPL-3.0</span>
            <h2>{es ? "Construye con nosotros." : "Build with us."}</h2>
            <p>{es ? "Mejora la documentación, informa de problemas de datos o propón una función. Comunica las vulnerabilidades en privado." : "Improve docs, report data issues, or propose a feature. Please report vulnerabilities privately."}</p>
          </div>
          <div className={styles.communityLinks}>
            <a href="https://github.com/assarasua/magic-brain/blob/main/CONTRIBUTING.md"><Code2 size={18} /><span><strong>Contribute</strong><small>Setup and pull requests</small></span><ArrowRight size={15} /></a>
            <a href="https://github.com/assarasua/magic-brain/issues"><LifeBuoy size={18} /><span><strong>Support</strong><small>Questions and bug reports</small></span><ArrowRight size={15} /></a>
            <a href="https://github.com/assarasua/magic-brain/security/advisories/new"><ShieldCheck size={18} /><span><strong>Security</strong><small>Private vulnerability report</small></span><ArrowRight size={15} /></a>
          </div>
        </section>

        <section className={styles.creatorSection} id="creator" aria-labelledby="creator-heading">
          <div className={styles.creatorStory}>
            <span>{es ? "Creador" : "Creator"}</span>
            <h2 id="creator-heading">
              {es ? "El padre de MagicBrain." : "The father of MagicBrain."}
            </h2>
            <p>
              {es
                ? "Asier Sarasua imaginó y construyó MagicBrain en BizkardoLab, uniendo diseño de producto, inteligencia de mercado e infraestructura abierta para la comunidad de Magic."
                : "Asier Sarasua imagined and built MagicBrain at BizkardoLab, bringing product craft, market intelligence, and open infrastructure together for the Magic community."}
            </p>
          </div>
          <aside className={styles.creatorCard} aria-label={es ? "Perfil del creador" : "Creator profile"}>
            <div className={styles.creatorMonogram} aria-hidden="true">AS</div>
            <div className={styles.creatorIdentity}>
              <span>{es ? "Fundador y creador" : "Founder & creator"}</span>
              <strong>Asier Sarasua</strong>
              <small>BizkardoLab</small>
            </div>
            <div className={styles.creatorLinks}>
              <a href="https://bizkardolab.eu/" target="_blank" rel="noopener noreferrer">
                <Building2 size={15} /> BizkardoLab <ExternalLink size={12} />
              </a>
              <a href="https://x.com/assarasua" target="_blank" rel="noopener noreferrer">
                <AtSign size={15} /> @assarasua <ExternalLink size={12} />
              </a>
            </div>
          </aside>
        </section>

        <aside className={styles.useNotice}>
          <strong>{es ? "Atribución y uso aceptable" : "Attribution & acceptable use"}</strong>
          <p>{es ? "Atribuye a Magic Brain y conserva los metadatos de fuente de cada registro. Respeta las condiciones de Scryfall, MTGJSON, Cardmarket, Wizards of the Coast y otros proveedores. No uses la API para reconstruir o redistribuir masivamente datos restringidos, eludir cuotas, degradar el servicio, identificar usuarios ni presentar datos como asesoramiento financiero." : "Credit Magic Brain and retain each record’s source metadata. Respect Scryfall, MTGJSON, Cardmarket, Wizards of the Coast, and other upstream terms. Do not use the API to reconstruct or bulk redistribute restricted datasets, evade quotas, degrade service, identify users, or present data as financial advice."}</p>
          <a href="https://github.com/assarasua/magic-brain/blob/main/NOTICE.md">{es ? "Leer avisos de datos" : "Read data notices"} <ExternalLink size={13} /></a>
        </aside>
      </div>

      <footer className={styles.footer}>
        <Link href="/"><MagicBrainLogo /></Link>
        <p>
          {es ? "Creado por" : "Created by"}{" "}
          <a href="https://bizkardolab.eu/" target="_blank" rel="noopener noreferrer">
            Asier Sarasua · BizkardoLab
          </a>
          . {es ? "Inteligencia de mercado no oficial de Magic: The Gathering." : "Unofficial Magic: The Gathering market intelligence."}
        </p>
        <nav aria-label="Developer footer">
          <a href="/api/v1/openapi.json">OpenAPI</a>
          <a href="https://github.com/assarasua/magic-brain">GitHub</a>
          <Link href="/donate">Support</Link>
          <a href="https://github.com/assarasua/magic-brain/blob/main/NOTICE.md">Attribution</a>
          <a href="https://github.com/assarasua/magic-brain/security/advisories/new">Security</a>
        </nav>
      </footer>
    </main>
  );
}
