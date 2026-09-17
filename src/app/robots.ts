import type { MetadataRoute } from "next";

const CANONICAL_HOST = "https://magicbrain.es";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/llms.txt", "/login", "/developers", "/market-movers", "/privacy", "/cookies", "/terms", "/api/market/movers", "/api/v1/news/latest", "/_next/static/", "/_next/image"],
      disallow: ["/api/account", "/api/portfolio", "/api/watchlist", "/api/referrals", "/api/oauth", "/oauth", "/shared", "/settings", "/portfolio", "/watchlist", "/referrals"],
    },
    sitemap: `${CANONICAL_HOST}/sitemap.xml`,
    host: CANONICAL_HOST,
  };
}
