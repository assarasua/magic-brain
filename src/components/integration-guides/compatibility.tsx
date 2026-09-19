"use client";

import Link from "next/link";
import { useLanguage } from "@/components/language-provider";
import styles from "./guides.module.css";

const assistantRoutes = [
  { name: "Claude", setup: "setup-claude", route: ["Custom remote connector", "Conector remoto personalizado"], note: ["Enable the connector in the conversation. Organization policy can restrict custom connectors.", "Activa el conector en la conversación. Tu organización puede restringir conectores personalizados."], source: "https://claude.com/docs/connectors/custom/remote-mcp" },
  { name: "ChatGPT", setup: "setup-chatgpt", route: ["Developer mode on the web", "Developer mode en la web"], note: ["Officially listed for Plus, Pro, Business, Enterprise and Education; workspace policies apply.", "Documentado para Plus, Pro, Business, Enterprise y Education; se aplican las políticas del espacio."], source: "https://developers.openai.com/api/docs/guides/developer-mode" },
  { name: "Grok", setup: "setup-grok", route: ["Custom MCP connector; also xAI API", "Conector MCP personalizado; también API de xAI"], note: ["Use New Connector → Custom at grok.com/connectors when available in your account.", "Usa New Connector → Custom en grok.com/connectors cuando esté disponible en tu cuenta."], source: "https://docs.x.ai/grok/connectors" },
  { name: "Gemini", setup: "setup-gemini", route: ["Gemini CLI", "Gemini CLI"], note: ["Documented CLI route, with paid API or supported enterprise access. A custom MCP URL field in the Gemini web/mobile chat is not verified here. Free/Google One CLI users have a separate Antigravity migration path.", "Vía CLI documentada, con API de pago o acceso empresarial compatible. No verificamos aquí un campo de URL MCP personalizada en el chat web/móvil de Gemini. Los usuarios CLI gratuitos/Google One tienen una migración a Antigravity."], source: "https://geminicli.com/docs/tools/mcp-server/" },
  { name: "Codex", setup: "setup-codex", route: ["Codex host MCP configuration", "Configuración MCP del host Codex"], note: ["Use the remote URL in config.toml. Authenticate separately for personal tools.", "Usa la URL remota en config.toml. Autentícate por separado para herramientas personales."], source: "https://learn.chatgpt.com/docs/extend/mcp" },
  { name: "Cursor", setup: "setup-cursor", route: ["Remote MCP in Agent mode", "MCP remoto en modo Agent"], note: ["Configure mcpServers with url in mcp.json, then enable the server.", "Configura mcpServers con url en mcp.json y activa el servidor."], source: "https://cursor.com/docs/mcp" },
  { name: "VS Code + Copilot", setup: "setup-vscode", route: ["HTTP MCP server in Agent mode", "Servidor MCP HTTP en modo Agent"], note: ["Copilot access and any organization MCP policy must allow it.", "Necesitas acceso a Copilot y que la política MCP de tu organización lo permita."], source: "https://code.visualstudio.com/docs/copilot/customization/mcp-servers" },
] as const;

export function AssistantCompatibility() {
  const { locale } = useLanguage();
  const es = locale === "es";
  const index = es ? 1 : 0;
  return <>
    <p>{es ? "La compatibilidad depende del cliente, no solo del modelo. Estas son las vías documentadas revisadas el 19 de septiembre de 2026; no equivalen a una prueba con cada cuenta, plan o dispositivo." : "Compatibility depends on the client, not just the model. These are documented connection routes checked on September 19, 2026; they are not tests of every account, plan or device."}</p>
    <div className={styles.tableWrap}><table><thead><tr><th>{es ? "Asistente" : "Assistant"}</th><th>{es ? "Vía documentada" : "Documented route"}</th><th>{es ? "Qué necesitas" : "What you need"}</th></tr></thead><tbody>{assistantRoutes.map(row => <tr key={row.name}><td><a href={`#${row.setup}`}>{row.name}</a></td><td>{row.route[index]}</td><td>{row.note[index]} <a href={row.source}>{es ? "Fuente oficial" : "Official source"} ↗</a></td></tr>)}</tbody></table></div>
    <p>{es ? "Otros clientes pueden funcionar si admiten servidores MCP remotos mediante Streamable HTTP. Para herramientas dentro de una página abierta, consulta la compatibilidad WebMCP." : "Other clients can work if they support remote MCP servers over Streamable HTTP. For tools inside an open page, check WebMCP compatibility."} <Link href="/webmcp#compatibility">WebMCP →</Link></p>
  </>;
}

export function BrowserCompatibility() {
  const { locale } = useLanguage();
  const es = locale === "es";
  const rows = [
    ["Instinct", es ? "Recomendado · comprobar entorno" : "Recommended · check your environment", es ? "Usa la invitación de Asier. Abre Magic Brain en su navegador y verifica que el agente descubre las herramientas. La recomendación no certifica todas las versiones." : "Use Asier’s invitation. Open Magic Brain in its browser and verify that the agent discovers the tools. This recommendation does not certify every version."],
    ["Google Chrome", es ? "Vista previa documentada" : "Documented preview", es ? "Google documenta WebMCP en su programa de vista previa. Sigue sus requisitos y usa un agente compatible; instalar Chrome por sí solo no conecta un agente." : "Google documents WebMCP in its preview program. Follow its requirements and use a compatible agent; installing Chrome alone does not connect an agent."],
    ["Microsoft Edge", es ? "No verificado por Magic Brain" : "Not verified by Magic Brain", es ? "Comprueba la API de registro y la lista del agente. Usar Chromium como base no garantiza que WebMCP esté habilitado." : "Check the registration API and the agent’s tool list. A Chromium base does not guarantee that WebMCP is enabled."],
    ["Brave / Arc", es ? "No verificado por Magic Brain" : "Not verified by Magic Brain", es ? "Depende de la versión y del entorno del agente. No asumimos compatibilidad por el motor del navegador." : "Depends on the build and agent environment. We do not infer compatibility from the browser engine."],
    ["Firefox / Safari", es ? "No verificado por Magic Brain" : "Not verified by Magic Brain", es ? "La web normal se puede usar. Para WebMCP, comprueba la API de registro; si no aparece, usa un cliente MCP remoto." : "The ordinary website remains usable. For WebMCP, check the registration API; if absent, use a remote MCP client."],
  ];
  return <>
    <p>{es ? "Necesitas las dos piezas: un navegador que exponga WebMCP y un agente que lo pueda usar. Esta lista, revisada el 19 de septiembre de 2026, distingue recomendaciones, documentación publicada y entornos que no hemos verificado." : "You need both pieces: a browser that exposes WebMCP and an agent that can use it. This list, checked on September 19, 2026, distinguishes recommendations, published documentation and environments we have not verified."}</p>
    <div className={styles.tableWrap}><table><thead><tr><th>{es ? "Navegador / entorno" : "Browser / environment"}</th><th>{es ? "Estado" : "Status"}</th><th>{es ? "Cómo proceder" : "How to proceed"}</th></tr></thead><tbody>{rows.map(([name, status, note]) => <tr key={name}><td>{name}</td><td>{status}</td><td>{note}</td></tr>)}</tbody></table></div>
    <p><a href="https://developer.chrome.com/blog/webmcp-epp">{es ? "Fuente: vista previa oficial de WebMCP en Chrome" : "Source: Chrome’s official WebMCP preview"} ↗</a></p>
    <p>{es ? "Usa «Comprobar navegador» arriba como primer paso y pide después al agente que enumere sus herramientas. Una API detectada no prueba que el agente esté conectado. El acceso MCP de Claude, ChatGPT, Grok o Gemini CLI tampoco implica acceso WebMCP a una pestaña." : "Use “Check this browser” above first, then ask the agent to list its tools. Detecting the API does not prove the agent is connected. MCP access from Claude, ChatGPT, Grok or Gemini CLI does not also imply WebMCP access to a tab."}</p>
  </>;
}
