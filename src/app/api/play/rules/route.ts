import { ApiError } from "@/lib/public-api/core";
import { publicApiHandler } from "@/lib/public-api/http";
import {
  fetchRuleReference,
  ruleServiceFetch,
} from "@/lib/play/rule-reference";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function GET(request: Request) {
  const response = await publicApiHandler(request, "none", async () => {
    const query = new URL(request.url).searchParams.get("q") ?? "";
    if (query.trim().length < 2 || query.length > 200)
      throw new ApiError(
        400,
        "invalid_query",
        "Enter a rule number or a question up to 200 characters.",
      );
    try {
      const isCloudflare =
        typeof navigator !== "undefined" &&
        navigator.userAgent === "Cloudflare-Workers";
      const binding = isCloudflare
        ? (
            getCloudflareContext().env as unknown as {
              MAGIC_BRAIN_MCP?: { fetch(request: Request): Promise<Response> };
            }
          ).MAGIC_BRAIN_MCP
        : undefined;
      return {
        data: await fetchRuleReference(
          query,
          binding ? ruleServiceFetch(binding) : fetch,
        ),
      };
    } catch (error) {
      if (error instanceof Error && error.message === "rateLimit")
        throw new ApiError(429, "rate_limit", "Try again shortly.");
      throw new ApiError(
        502,
        "reference_unavailable",
        "The rulebook could not be reached.",
      );
    }
  });
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}
