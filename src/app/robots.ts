import type { MetadataRoute } from "next";
import { SITE_PAUSED } from "../lib/site-mode.ts";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: SITE_PAUSED ? {
      userAgent: "*",
      allow: ["/$", "/privacy", "/cookies", "/terms", "/previews/", "/_next/static/", "/_next/image"],
      disallow: ["/api/", "/oauth/", "/shared/", "/login", "/developers", "/mcp", "/webmcp", "/market", "/portfolio", "/watchlist", "/settings"],
    } : {
      userAgent: "*",
      allow: ["/llms.txt", "/login", "/developers", "/mcp", "/webmcp", "/market-movers", "/privacy", "/cookies", "/terms", "/api/market/movers", "/api/v1/news/latest", "/_next/static/", "/_next/image"],
      disallow: ["/api/account", "/api/portfolio", "/api/watchlist", "/api/referrals", "/api/oauth", "/oauth", "/shared", "/settings", "/portfolio", "/watchlist", "/referrals"],
    },
    sitemap: "https://magicbrain.es/sitemap.xml",
    host: "https://magicbrain.es",
  };
}
