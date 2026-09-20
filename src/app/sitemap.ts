import type { MetadataRoute } from "next";

const host = "https://magicbrain.es";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${host}/login`, changeFrequency: "weekly", priority: 1 },
    { url: `${host}/market-movers`, changeFrequency: "daily", priority: 0.9 },
    { url: `${host}/developers`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${host}/mcp`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${host}/webmcp`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${host}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${host}/cookies`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${host}/terms`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
