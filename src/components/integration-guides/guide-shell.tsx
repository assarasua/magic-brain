"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ArrowUpRight, Check, Copy } from "lucide-react";
import { MagicBrainLogo } from "@/components/brand-logo";
import { LanguageToggle, useLanguage } from "@/components/language-provider";
import styles from "./guides.module.css";

export function CopyBlock({ text, label = "JSON" }: { text: string; label?: string }) {
  const { locale } = useLanguage();
  const [status, setStatus] = useState("");
  const es = locale === "es";
  return <div className={styles.codeBlock}>
    <div className={styles.codeHeader}><span>{label}</span><button type="button" onClick={async () => {
      try { await navigator.clipboard.writeText(text); setStatus(es ? "Copiado" : "Copied"); }
      catch { setStatus(es ? "Selecciona el texto para copiarlo" : "Select the text to copy it"); }
    }}>{status === "Copied" || status === "Copiado" ? <Check size={14} /> : <Copy size={14} />} {es ? "Copiar" : "Copy"}</button></div>
    <pre tabIndex={0} aria-label={label}><code>{text}</code></pre>
    <span className={styles.copyStatus} role="status">{status}</span>
  </div>;
}

export function GuideSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return <section id={id} className={styles.section} aria-labelledby={`${id}-heading`}>
    <h2 id={`${id}-heading`}>{title}</h2>{children}
  </section>;
}

export function GuideShell({ kind, title, intro, sections, children }: {
  kind: "mcp" | "webmcp"; title: string; intro: string;
  sections: Array<readonly [string, string]>; children: ReactNode;
}) {
  const { locale } = useLanguage();
  const es = locale === "es";
  const toc = <nav aria-label={es ? "En esta guía" : "On this page"}>
    {sections.map(([id, label], index) => <a key={id} href={`#${id}`}><span>{String(index + 1).padStart(2, "0")}</span>{label}</a>)}
  </nav>;
  return <div className={styles.page} lang={locale}>
    <a className={styles.skipLink} href="#guide-content">{es ? "Saltar al contenido" : "Skip to content"}</a>
    <header className={styles.header}>
      <Link href="/developers" aria-label="Magic Brain Developers"><MagicBrainLogo /></Link>
      <nav aria-label={es ? "Documentación" : "Documentation"}>
        <Link href="/developers">{es ? "Desarrolladores" : "Developers"}</Link>
        <Link href="/mcp" aria-current={kind === "mcp" ? "page" : undefined}>MCP</Link>
        <Link href="/webmcp" aria-current={kind === "webmcp" ? "page" : undefined}>WebMCP</Link>
      </nav>
      <LanguageToggle />
    </header>
    <div className={styles.hero}>
      <p className={styles.eyebrow}>MAGIC BRAIN / {es ? "GUÍAS DE INTEGRACIÓN" : "INTEGRATION GUIDES"}</p>
      <h1>{title}</h1><p className={styles.intro}>{intro}</p>
      <div className={styles.heroMeta}><span>{es ? "Guía pública · Sin registro" : "Public guide · No sign-in"}</span><span>{es ? "Referencia revisada: 19 sep 2026" : "Reference checked: Sep 19, 2026"}</span></div>
    </div>
    <div className={styles.layout}>
      <aside className={styles.sidebar}><span className={styles.sidebarLabel}>{es ? "EN ESTA GUÍA" : "ON THIS PAGE"}</span>{toc}<Link className={styles.sidebarApi} href="/developers#reference">REST API <ArrowUpRight size={14} /></Link></aside>
      <main id="guide-content" className={styles.main}>
        <details className={styles.mobileToc}><summary>{es ? "Contenido de la guía" : "Guide contents"}</summary>{toc}</details>
        {children}
        <footer className={styles.footer}><Link href="/developers">← {es ? "Volver a Desarrolladores" : "Back to Developers"}</Link><Link href={kind === "mcp" ? "/webmcp" : "/mcp"}>{kind === "mcp" ? "WebMCP" : "MCP"} <ArrowUpRight size={14} /></Link></footer>
      </main>
    </div>
  </div>;
}
