import type { MetadataRoute } from "next";

const CANONICAL_HOST = "https://magicbrain.es";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/developers", "/console", "/_next/static/", "/_next/image"],
      disallow: "/",
    },
    host: CANONICAL_HOST,
  };
}
