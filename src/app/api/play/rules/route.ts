import { ApiError } from "@/lib/public-api/core";
import { publicApiHandler } from "@/lib/public-api/http";
import { fetchRuleReference } from "@/lib/play/rule-reference";

export async function GET(request: Request) {
  const response = await publicApiHandler(request, "none", async () => {
    const query = new URL(request.url).searchParams.get("q") ?? "";
    if (!query.trim() || query.length > 200)
      throw new ApiError(
        400,
        "invalid_query",
        "Enter a rule number or a question up to 200 characters.",
      );
    try {
      return { data: await fetchRuleReference(query) };
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
