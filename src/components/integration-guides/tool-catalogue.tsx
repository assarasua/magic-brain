"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { CopyBlock } from "./guide-shell";
import { toolGroups, toolGuides } from "./tool-reference";
import schemaData from "./tool-schemas.json";
import styles from "./guides.module.css";

type Schema = { type?: string; enum?: unknown[]; const?: unknown; default?: unknown; minimum?: number; maximum?: number; minLength?: number; maxLength?: number; minItems?: number; maxItems?: number; format?: string; items?: Schema; anyOf?: Schema[]; properties?: Record<string, Schema>; required?: string[] };
const schemas = schemaData as Record<string, Schema>;

function describe(schema: Schema, es: boolean): string {
  const kind = schema.enum ? schema.enum.join(" | ") : schema.const !== undefined ? String(schema.const) : schema.anyOf ? schema.anyOf.map((item) => describe(item, es)).join(" | ") : schema.type === "array" ? `${describe(schema.items ?? {}, es)}[]` : schema.format ?? schema.type ?? "object";
  const constraints = [
    schema.minimum !== undefined ? `≥ ${schema.minimum}` : "",
    schema.maximum !== undefined ? `≤ ${schema.maximum}` : "",
    schema.minLength !== undefined ? `${es ? "mín." : "min"} ${schema.minLength} ${es ? "caracteres" : "chars"}` : "",
    schema.maxLength !== undefined ? `${es ? "máx." : "max"} ${schema.maxLength} ${es ? "caracteres" : "chars"}` : "",
    schema.minItems !== undefined ? `${es ? "mín." : "min"} ${schema.minItems} ${es ? "elementos" : "items"}` : "",
    schema.maxItems !== undefined ? `${es ? "máx." : "max"} ${schema.maxItems} ${es ? "elementos" : "items"}` : "",
    schema.default !== undefined ? `${es ? "por defecto" : "default"}: ${JSON.stringify(schema.default)}` : "",
  ].filter(Boolean);
  return [kind, ...constraints].join(" · ");
}

export function ToolCatalogue() {
  const { locale } = useLanguage();
  const es = locale === "es";
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("all");
  useEffect(() => {
    const revealTool = () => {
      const target = document.getElementById(window.location.hash.slice(1));
      if (target instanceof HTMLDetailsElement) target.open = true;
    };
    revealTool();
    window.addEventListener("hashchange", revealTool);
    return () => window.removeEventListener("hashchange", revealTool);
  }, []);
  const matches = toolGuides.filter((tool) => (group === "all" || tool.group === group) && `${tool.name} ${tool.purpose.join(" ")} ${tool.result.join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <div>
    <div className={styles.filters}>
      <label><span>{es ? "Buscar herramienta" : "Find a tool"}</span><div className={styles.searchField}><Search size={16} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={es ? "Nombre, efecto, precio…" : "Name, effect, price…"} /></div></label>
      <label><span>{es ? "Categoría" : "Category"}</span><select value={group} onChange={(event) => setGroup(event.target.value)}><option value="all">{es ? "Todas las herramientas" : "All tools"}</option>{Object.entries(toolGroups).map(([id, labels]) => <option key={id} value={id}>{labels[es ? 1 : 0]}</option>)}</select></label>
    </div>
    <p className={styles.resultCount} role="status">{matches.length} / {toolGuides.length} {es ? "herramientas · Abre una para ver sus parámetros y ejemplo." : "tools · Open a tool for parameters and an example."}</p>
    {matches.length === 0 && <p>{es ? "No hay coincidencias. Prueba otro término o categoría." : "No matches. Try another term or category."}</p>}
    <div className={styles.catalogue}>{matches.map((tool) => {
      const schema = schemas[tool.name];
      const parameters = Object.entries(schema.properties ?? {}).filter(([key]) => !key.startsWith("request_"));
      return <details id={tool.name} key={tool.name} className={styles.tool}>
        <summary><div><div className={styles.toolName}><code>{tool.name}</code><span className={tool.writes ? styles.writeBadge : styles.accessBadge}>{tool.writes ? (es ? "Escritura · OAuth" : "Write · OAuth") : tool.scopes ? "OAuth" : (es ? "Pública" : "Public")}</span></div><p>{tool.purpose[es ? 1 : 0]}</p></div><ChevronDown size={17} /></summary>
        <div className={styles.toolBody}>
          <h3>{es ? "Qué devuelve y cómo usarlo" : "What it returns and how to use it"}</h3><p>{tool.result[es ? 1 : 0]}</p>
          {tool.scopes && <p><strong>{es ? "Permisos necesarios: " : "Required scopes: "}</strong>{tool.scopes.map((scope) => <code className={styles.scope} key={scope}>{scope}</code>)}</p>}
          {tool.writes && <p className={styles.notice}>{es ? "Este ejemplo cambia datos. Sustituye los IDs de ejemplo y obtén confirmación expresa del usuario antes de enviar confirm: true. No repitas una acción tras un resultado incierto sin comprobar el estado." : "This example changes data. Replace example IDs and obtain explicit user confirmation before sending confirm: true. Check the resulting state before repeating an action after an uncertain response."}</p>}
          <h3>{es ? "Parámetros" : "Parameters"}</h3>
          {parameters.length ? <div className={styles.tableWrap}><table><thead><tr><th>{es ? "Parámetro" : "Parameter"}</th><th>{es ? "Requerido" : "Required"}</th><th>{es ? "Tipo y límites" : "Type and limits"}</th></tr></thead><tbody>{parameters.map(([name, parameter]) => <tr key={name}><td><code>{name}</code></td><td>{schema.required?.includes(name) ? (es ? "Sí" : "Yes") : (es ? "No" : "No")}</td><td>{describe(parameter, es)}{parameter.properties && <div>{es ? "Campos: " : "Fields: "}{Object.keys(parameter.properties).join(", ")}</div>}</td></tr>)}</tbody></table></div> : <p>{es ? "Sin parámetros específicos. Puedes enviar {}." : "No tool-specific parameters. You can send {}."}</p>}
          <p className={styles.small}>{es ? "Todas las herramientas admiten además los campos opcionales request_summary y request_context, explicados en Privacidad." : "Every tool also accepts optional request_summary and request_context, explained in Privacy."}</p>
          <CopyBlock label={es ? "Ejemplo de argumentos" : "Example arguments"} text={JSON.stringify(tool.example, null, 2)} />
          <details className={styles.schema}><summary>{es ? "Esquema completo de entrada (JSON Schema)" : "Full input schema (JSON Schema)"}</summary><CopyBlock label="JSON Schema" text={JSON.stringify(schema, null, 2)} /></details>
        </div>
      </details>;
    })}</div>
  </div>;
}
