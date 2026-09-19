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
export type { RuleResult } from "./rule-reference";
import type { RuleResult } from "./rule-reference";
export async function searchRulebook(query: string): Promise<RuleResult> {
  return (
    await readJson<{ data: RuleResult }>(
      `/api/play/rules?q=${encodeURIComponent(query)}`,
    )
  ).data;
}
