"use client";

import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  Clipboard,
  Code2,
  ExternalLink,
  Gauge,
  KeyRound,
  LifeBuoy,
  LoaderCircle,
  Menu,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { signIn, useSession } from "next-auth/react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { MagicBrainLogo } from "@/components/brand-logo";
import styles from "./developers.module.css";

export type DeveloperEndpoint = {
  method: string;
  path: string;
  operationId: string;
  summary: string;
  auth: "session" | "optional-key";
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
  ["reference", "API reference"],
  ["examples", "Examples"],
  ["keys", "API keys"],
  ["policies", "Policies"],
] as const;

function CodeSample() {
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
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre tabIndex={0}><code>{examples[language]}</code></pre>
    </div>
  );
}

function EndpointReference({ endpoints }: { endpoints: DeveloperEndpoint[] }) {
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
                  ? "Magic Brain account session required"
                  : "Anonymous access or Bearer API key"}
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
              <p className={styles.noParameters}>No parameters.</p>
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

function KeyManager() {
  const { status } = useSession();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [name, setName] = useState("");
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
        body: JSON.stringify({ name: name.trim() }),
      });
      const result = (await response.json()) as ApiEnvelope<ApiKey & { secret: string }>;
      if (!response.ok || !result.data) {
        throw new Error(result.error?.message ?? "Unable to create API key");
      }
      setSecret(result.data.secret);
      setName("");
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
    return <div className={styles.keyState}><LoaderCircle className="spin" size={20} /> Checking your account…</div>;
  }

  if (status !== "authenticated") {
    return (
      <div className={styles.signInCard}>
        <div><KeyRound size={23} /><span>300 requests per minute</span></div>
        <h3>Create a free API key</h3>
        <p>Sign in to create, inspect, and revoke keys. Secrets are shown once and stored only as hashes.</p>
        <button type="button" onClick={() => void signIn("google", { redirectTo: "/developers#keys" })}>
          Sign in to manage keys <ArrowRight size={15} />
        </button>
      </div>
    );
  }

  return (
    <div className={styles.keyManager}>
      <form onSubmit={createKey}>
        <label htmlFor="key-name">Key name</label>
        <div>
          <input
            id="key-name"
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            placeholder="Production website"
            disabled={loading}
          />
          <button type="submit" disabled={loading || !name.trim()}>
            {loading ? <LoaderCircle className="spin" size={16} /> : <KeyRound size={16} />}
            Create key
          </button>
        </div>
        <small>Use a distinct key per environment. Up to 10 active keys.</small>
      </form>

      {secret && (
        <div className={styles.secretNotice} role="status">
          <ShieldCheck size={20} />
          <div>
            <strong>Copy your new key now</strong>
            <p>It cannot be displayed again.</p>
            <code>{secret}</code>
          </div>
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(secret);
              setMessage("API key copied");
            }}
          >
            <Clipboard size={15} /> Copy
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
              <span>Created {new Date(key.createdAt).toLocaleDateString()}</span>
              <span>{key.lastUsedAt ? `Used ${new Date(key.lastUsedAt).toLocaleDateString()}` : "Never used"}</span>
            </div>
            {key.revokedAt ? (
              <span className={styles.revokedLabel}>Revoked</span>
            ) : (
              <button type="button" onClick={() => void revokeKey(key)} disabled={loading}>
                <Trash2 size={14} /> Revoke
              </button>
            )}
          </article>
        ))}
        {!loading && keys.length === 0 && <p className={styles.emptyKeys}>No keys yet. Create one for your first integration.</p>}
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

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" aria-label="Magic Brain home"><MagicBrainLogo /></Link>
        <nav aria-label="Developer navigation">
          {navItems.slice(0, 4).map(([id, label]) => <a href={`#${id}`} key={id}>{label}</a>)}
        </nav>
        <div className={styles.headerActions}>
          <a href="/api/v1/openapi.json">OpenAPI</a>
          <a className={styles.githubButton} href="https://github.com/assarasua/magic-brain" target="_blank" rel="noreferrer">
            <Code2 size={16} /> GitHub
          </a>
        </div>
        <button
          className={styles.menuButton}
          type="button"
          aria-label="Toggle developer navigation"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((current) => !current)}
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        {menuOpen && (
          <nav className={styles.mobileNav} aria-label="Mobile developer navigation">
            {navItems.map(([id, label]) => <a href={`#${id}`} onClick={() => setMenuOpen(false)} key={id}>{label}</a>)}
            <a href="https://github.com/assarasua/magic-brain">GitHub <ExternalLink size={13} /></a>
          </nav>
        )}
      </header>

      <section className={styles.hero} id="overview">
        <div className={styles.heroGlow} />
        <div className={styles.heroCopy}>
          <span className={styles.badge}><Sparkles size={13} /> Data API v{apiVersion}</span>
          <h1>Magic market data,<br /><em>built for builders.</em></h1>
          <p>Query card printings, sets, and EUR price history through a stable, provenance-aware API. Start anonymously, then create a free key when you need more room.</p>
          <div className={styles.heroActions}>
            <a href="#examples">Make your first request <ArrowRight size={16} /></a>
            <a href="#reference">Explore endpoints</a>
          </div>
          <div className={styles.heroFacts}>
            <span><Check size={14} /> No key to start</span>
            <span><Check size={14} /> OpenAPI 3.1</span>
            <span><Check size={14} /> CORS enabled</span>
          </div>
        </div>
        <CodeSample />
      </section>

      <div className={styles.content}>
        <section className={styles.section} id="reference">
          <div className={styles.sectionHeading}>
            <span>Reference</span>
            <h2>One contract, always current.</h2>
            <p>This reference is rendered directly from the same OpenAPI definition served by the API.</p>
          </div>
          <EndpointReference endpoints={endpoints} />
        </section>

        <section className={styles.section} id="examples">
          <div className={styles.sectionHeading}>
            <span>Quickstart</span>
            <h2>From zero to data in seconds.</h2>
            <p>Bearer keys are optional for read-only data endpoints. Never expose a key in browser code or a public repository.</p>
          </div>
          <CodeSample />
          <div className={styles.responseNote}>
            <Code2 size={20} />
            <div><strong>Predictable envelopes</strong><p>Success responses use <code>data</code> and <code>meta</code>. Cursor pagination is under <code>meta.pagination.nextCursor</code>.</p></div>
          </div>
        </section>

        <section className={styles.section} id="keys">
          <div className={styles.sectionHeading}>
            <span>Access</span>
            <h2>Your API keys.</h2>
            <p>Keys carry the <code>data:read</code> scope. Revocation is immediate.</p>
          </div>
          <KeyManager />
        </section>

        <section className={styles.section} id="policies">
          <div className={styles.sectionHeading}>
            <span>Production guide</span>
            <h2>Limits, freshness, and failure modes.</h2>
          </div>
          <div className={styles.policyGrid}>
            <article><Gauge size={20} /><h3>Quotas</h3><p><strong>Anonymous:</strong> 30 requests/minute per IP.<br /><strong>API key:</strong> 300 requests/minute.</p><small>Inspect <code>RateLimit-Limit</code>, <code>RateLimit-Remaining</code>, and <code>Retry-After</code>. Back off on 429.</small></article>
            <article><RefreshCw size={20} /><h3>Freshness</h3><p>Latest prices cache for 5 minutes. Metadata and history cache for 1 hour, with stale responses allowed while revalidating.</p><small>Every price includes source, observation date, EUR currency, and finish.</small></article>
            <article><ShieldCheck size={20} /><h3>Errors</h3><p>Errors have a stable <code>error.code</code>, human-readable message, optional details, and <code>meta.requestId</code>.</p><small>Send the request ID when asking for support. Treat 5xx errors as retryable with backoff.</small></article>
            <article><BookOpen size={20} /><h3>Version policy</h3><p><code>/api/v1</code> receives backward-compatible additions. Breaking changes ship under a new major path with migration notes.</p><small>Deprecated fields will be announced before removal. Follow repository releases for changes.</small></article>
          </div>
        </section>

        <section className={styles.community}>
          <div>
            <span>Open source · AGPL-3.0</span>
            <h2>Build with us.</h2>
            <p>Improve docs, report data issues, or propose a feature. Please report vulnerabilities privately.</p>
          </div>
          <div className={styles.communityLinks}>
            <a href="https://github.com/assarasua/magic-brain/blob/main/CONTRIBUTING.md"><Code2 size={18} /><span><strong>Contribute</strong><small>Setup and pull requests</small></span><ArrowRight size={15} /></a>
            <a href="https://github.com/assarasua/magic-brain/issues"><LifeBuoy size={18} /><span><strong>Support</strong><small>Questions and bug reports</small></span><ArrowRight size={15} /></a>
            <a href="https://github.com/assarasua/magic-brain/security/advisories/new"><ShieldCheck size={18} /><span><strong>Security</strong><small>Private vulnerability report</small></span><ArrowRight size={15} /></a>
          </div>
        </section>

        <aside className={styles.useNotice}>
          <strong>Attribution &amp; acceptable use</strong>
          <p>Credit Magic Brain and retain each record’s source metadata. Respect Scryfall, MTGJSON, Cardmarket, Wizards of the Coast, and other upstream terms. Do not use the API to reconstruct or bulk redistribute restricted datasets, evade quotas, degrade service, identify users, or present data as financial advice.</p>
          <a href="https://github.com/assarasua/magic-brain/blob/main/NOTICE.md">Read data notices <ExternalLink size={13} /></a>
        </aside>
      </div>

      <footer className={styles.footer}>
        <Link href="/"><MagicBrainLogo /></Link>
        <p>Unofficial Magic: The Gathering market intelligence. Not affiliated with Wizards of the Coast.</p>
        <nav aria-label="Developer footer">
          <a href="/api/v1/openapi.json">OpenAPI</a>
          <a href="https://github.com/assarasua/magic-brain">GitHub</a>
          <a href="https://github.com/assarasua/magic-brain/blob/main/NOTICE.md">Attribution</a>
          <a href="https://github.com/assarasua/magic-brain/security/advisories/new">Security</a>
        </nav>
      </footer>
    </main>
  );
}
