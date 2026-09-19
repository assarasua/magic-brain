import { definitionFromLookup } from "./decks";

export type CardReference = {
  card: Parameters<typeof definitionFromLookup>[0] & {
    scryfallId: string;
    rulings?: { comment: string; publishedAt: string; source: string }[];
    rulingsTruncated?: boolean;
  };
  source?: { oracle?: { updatedAt?: string } };
};
type Printing = {
  id?: string;
  oracleId?: string;
  name?: string;
  typeLine?: string;
  colorIdentity?: string[];
  imageUrl?: string;
};
export class ReferenceError extends Error {
  constructor(
    public code:
      | "unavailable"
      | "ambiguous"
      | "rateLimit"
      | "signIn"
      | "notFound",
  ) {
    super(code);
  }
}
async function readJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(20000)])
      : AbortSignal.timeout(20000),
  });
  if (!response.ok)
    throw new ReferenceError(
      response.status === 429
        ? "rateLimit"
        : response.status === 401
          ? "signIn"
          : response.status === 404
            ? "notFound"
            : response.status === 409
              ? "ambiguous"
              : "unavailable",
    );
  return response.json() as Promise<T>;
}
const cache = new Map<
  string,
  { reference: CardReference; printing: Printing }
>();
export async function lookupCard(name: string, signal?: AbortSignal) {
  const key = name.toLowerCase();
  const cached = cache.get(key);
  if (cached) return cached;
  let reference: CardReference;
  let printing: Printing = {};
  try {
    reference = (
      await readJson<{ data: CardReference }>(
        `/api/v1/card-rules?card=${encodeURIComponent(name)}`,
        signal,
      )
    ).data;
  } catch (error) {
    if (
      !(error instanceof ReferenceError) ||
      !["ambiguous", "notFound"].includes(error.code)
    )
      throw error;
    const catalog = await readJson<{ data: Printing[] }>(
      `/api/v1/cards?q=${encodeURIComponent(name)}&limit=50`,
      signal,
    );
    const exact = catalog.data.filter(
      (c) =>
        c.name?.toLowerCase() === key &&
        !/Art Series|Token|Emblem/.test(c.typeLine ?? ""),
    );
    const ids = new Set(exact.map((c) => c.oracleId).filter(Boolean));
    if (ids.size !== 1)
      throw new ReferenceError(ids.size ? "ambiguous" : "notFound");
    printing = exact[0];
    reference = (
      await readJson<{ data: CardReference }>(
        `/api/v1/card-rules?card=${encodeURIComponent(printing.oracleId!)}`,
        signal,
      )
    ).data;
  }
  if (!printing.colorIdentity)
    printing = (
      await readJson<{ data: Printing }>(
        `/api/v1/cards/${encodeURIComponent(reference.card.scryfallId)}`,
        signal,
      )
    ).data;
  const result = { reference, printing };
  cache.set(key, result);
  return result;
}
export async function resolveDefinition(name: string, signal?: AbortSignal) {
  const result = await lookupCard(name, signal);
  return definitionFromLookup(result.reference.card, result.printing);
}
export async function collectionLists() {
  return (
    await readJson<{ lists: { id: string; name: string }[] }>(
      "/api/portfolio/lists",
    )
  ).lists;
}
export async function collectionDeck(id: string) {
  const result = await readJson<{
    holdings: { name: string; quantity: number }[];
  }>(`/api/portfolio?listId=${encodeURIComponent(id)}`);
  const names = new Map<string, number>();
  for (const c of result.holdings)
    names.set(c.name, (names.get(c.name) ?? 0) + c.quantity);
  return [...names].map(([name, quantity]) => `${quantity} ${name}`).join("\n");
}
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
export async function searchRulebook(query: string): Promise<RuleResult> {
  const response = await fetch(
    "https://magic-brain-mcp.assarasua.workers.dev/mcp",
    {
      method: "POST",
      signal: AbortSignal.timeout(20000),
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
          arguments: { query, limit: 5, max_excerpt_chars: 600 },
        },
      }),
    },
  );
  if (!response.ok)
    throw new ReferenceError(
      response.status === 429 ? "rateLimit" : "unavailable",
    );
  const raw = await response.text();
  const data = raw.trim().startsWith("{")
    ? JSON.parse(raw)
    : JSON.parse(
        raw
          .split("\n")
          .filter((l) => l.startsWith("data:"))
          .at(-1)
          ?.slice(5) ?? "{}",
      );
  if (data.error || data.result?.isError)
    throw new ReferenceError("unavailable");
  const result =
    data.result?.structuredContent ??
    JSON.parse(
      data.result?.content?.find((c: { type: string }) => c.type === "text")
        ?.text ?? "{}",
    );
  if (!Array.isArray(result.results) || !result.source)
    throw new ReferenceError("unavailable");
  return result;
}
