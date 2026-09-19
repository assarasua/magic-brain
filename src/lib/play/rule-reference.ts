export type RuleResult = {
  results: {
    excerpt: string;
    citation: {
      ruleNumber?: string;
      glossaryTerm?: string;
      section: string;
      page: number;
      sourceUrl: string;
    };
  }[];
  source: { effectiveDate: string; freshnessNotice: string };
};

export function ruleServiceFetch(binding: {
  fetch(request: Request): Promise<Response>;
}): typeof fetch {
  return (input, init) => binding.fetch(new Request(input, init));
}

// Only this read-only tool can be called. Browser cookies and credentials are
// never forwarded to the remote MCP service.
export async function fetchRuleReference(
  query: string,
  request: typeof fetch = fetch,
): Promise<RuleResult> {
  if (query.trim().length < 2 || query.length > 200) throw new Error("query");
  const response = await request(
    "https://magic-brain-mcp.assarasua.workers.dev/mcp",
    {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(12000),
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": "2025-06-18",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: crypto.randomUUID(),
        method: "tools/call",
        params: {
          name: "search_rules",
          arguments: { query: query.trim(), limit: 5, max_excerpt_chars: 600 },
        },
      }),
    },
  );
  if (!response.ok)
    throw new Error(response.status === 429 ? "rateLimit" : "unavailable");
  const raw = await response.text();
  if (raw.length > 100000) throw new Error("unavailable");
  const data = JSON.parse(
    raw.trim().startsWith("{")
      ? raw
      : (raw
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .at(-1)
          ?.slice(5) ?? "{}"),
  );
  if (data.error || data.result?.isError) throw new Error("unavailable");
  const result =
    data.result?.structuredContent ??
    JSON.parse(
      data.result?.content?.find((c: { type: string }) => c.type === "text")
        ?.text ?? "{}",
    );
  if (
    !Array.isArray(result.results) ||
    !result.source ||
    typeof result.source.effectiveDate !== "string" ||
    typeof result.source.freshnessNotice !== "string" ||
    result.results.some(
      (r: RuleResult["results"][number]) =>
        typeof r.excerpt !== "string" ||
        typeof r.citation?.sourceUrl !== "string",
    )
  )
    throw new Error("unavailable");
  return result;
}
