/** Temporary product pause. Re-enable only as part of an intentional relaunch. */
export const SITE_PAUSED = true;

export const PAUSED_MESSAGE = "Magic Brain is temporarily paused. Subscribe at https://magicbrain.es for updates.";

const publicPages = new Set(["/", "/privacy", "/cookies", "/terms", "/robots.txt", "/sitemap.xml", "/llms.txt", "/icon.svg", "/favicon.ico"]);
const previews = new Set(["/previews/magic-brain.jpg", "/previews/cards-and-prices.jpg", "/previews/assistant.jpg"]);

export function pausedRequestAction(pathname: string, method: string): "allow" | "redirect" | "unavailable" {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/api/newsletter" && method === "POST") return "allow";
  if (method !== "GET" && method !== "HEAD") return "unavailable";
  if (publicPages.has(path) || previews.has(path)) return "allow";
  if (path === "/api" || path.startsWith("/api/") || path.startsWith("/.well-known/")) return "unavailable";
  return "redirect";
}
