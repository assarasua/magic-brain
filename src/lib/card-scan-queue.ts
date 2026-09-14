import type { CardLanguage } from "@/lib/card-languages";
import type { IdentifiedCatalogCard } from "@/lib/catalog";

const DEFAULT_QUEUE_LIMIT = 24;

export type BulkScanStatus =
  | "queued"
  | "processing"
  | "identified"
  | "needs_review"
  | "error"
  | "adding"
  | "added";

export type BulkScanItem = {
  id: string;
  previewUrl: string;
  hash: string;
  status: BulkScanStatus;
  captureConfidence: number;
  matchConfidence: number | null;
  candidates: IdentifiedCatalogCard[];
  selected: IdentifiedCatalogCard | null;
  quantity: number;
  purchasePrice: number | null;
  condition: "near_mint" | "excellent" | "good" | "light_played";
  language: CardLanguage;
  listId: string;
  acquiredAt: string;
  duplicateWarning: boolean;
  error?: string;
};

export function enqueueBounded(
  items: BulkScanItem[],
  item: BulkScanItem,
  limit = DEFAULT_QUEUE_LIMIT,
) {
  if (items.length >= limit) {
    return { items, accepted: false };
  }
  return { items: [...items, item], accepted: true };
}

export function resolveQueueItem(
  items: BulkScanItem[],
  itemId: string,
  candidates: IdentifiedCatalogCard[],
) {
  const best = candidates[0] ?? null;
  const highConfidence =
    best !== null &&
    best.confidence >= 0.9 &&
    (best.reason === "exact_print" || best.reason === "collector_match");
  const next = items.map((item) =>
    item.id === itemId
      ? {
          ...item,
          status: highConfidence ? "identified" as const : "needs_review" as const,
          candidates,
          selected: highConfidence ? best : null,
          matchConfidence: best?.confidence ?? null,
          purchasePrice: best?.price ?? item.purchasePrice,
        }
      : item,
  );
  if (!highConfidence || !best) return next;

  const current = next.find((item) => item.id === itemId)!;
  const duplicate = next.find(
    (item) =>
      item.id !== itemId &&
      item.selected?.id === best.id &&
      item.language === current.language &&
      item.listId === current.listId &&
      item.condition === current.condition &&
      item.purchasePrice === current.purchasePrice &&
      item.acquiredAt === current.acquiredAt &&
      (item.status === "identified" || item.status === "needs_review"),
  );
  if (!duplicate) return next;

  return next
    .filter((item) => item.id !== itemId)
    .map((item) =>
      item.id === duplicate.id
        ? {
            ...item,
            quantity: item.quantity + current.quantity,
            duplicateWarning: true,
          }
        : item,
    );
}

export function resolvedItems(items: BulkScanItem[]) {
  return items.filter(
    (item) =>
      item.selected !== null &&
      (item.status === "identified" || item.status === "needs_review" || item.status === "error"),
  );
}

export class BoundedSerialQueue<T> {
  private pending: T[] = [];
  private running = false;
  private readonly worker: (value: T) => Promise<void>;
  private readonly limit: number;

  constructor(
    worker: (value: T) => Promise<void>,
    limit = DEFAULT_QUEUE_LIMIT,
  ) {
    this.worker = worker;
    this.limit = limit;
  }

  push(value: T) {
    if (this.pending.length + (this.running ? 1 : 0) >= this.limit) return false;
    this.pending.push(value);
    void this.drain();
    return true;
  }

  get size() {
    return this.pending.length + (this.running ? 1 : 0);
  }

  private async drain() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.pending.length > 0) {
        await this.worker(this.pending.shift()!);
      }
    } finally {
      this.running = false;
    }
  }
}
