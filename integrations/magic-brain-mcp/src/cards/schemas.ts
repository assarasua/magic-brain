import { z } from "zod";

const nullableText = z.string().nullable();
const snapshotFile = z.object({
  provider: z.string(),
  url: z.string().url(),
  updatedAt: z.string().nullable(),
  fetchedAt: z.string(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  format: z.enum(["json", "jsonl", "jsonl-gzip"]).optional(),
  checksumScope: z.literal("downloaded-bytes").optional(),
});

export const cardSourceSchema = z.object({
  datasetId: z.string(),
  importedAt: z.string(),
  oracle: snapshotFile,
  rulings: snapshotFile,
  cardCount: z.number().int().nonnegative(),
  effectCount: z.number().int().nonnegative(),
  rulingCount: z.number().int().nonnegative(),
});

export const cardRulesSchema = z.object({
  oracleId: z.string(),
  scryfallId: z.string(),
  name: z.string(),
  layout: z.string(),
  typeLine: z.string(),
  oracleText: nullableText,
  manaCost: nullableText,
  keywords: z.array(z.string()),
  faces: z.array(z.object({
    faceIndex: z.number().int().nonnegative(),
    name: z.string(),
    typeLine: nullableText,
    manaCost: nullableText,
    oracleText: nullableText,
    power: nullableText,
    toughness: nullableText,
    loyalty: nullableText,
    defense: nullableText,
  })),
  sourceUrl: z.string().url(),
  effects: z.array(z.object({
    faceIndex: z.number().int().nonnegative(),
    effectIndex: z.number().int().nonnegative(),
    text: z.string(),
  })),
  rulings: z.array(z.object({
    source: z.enum(["wotc", "scryfall"]),
    publishedAt: z.string(),
    comment: z.string(),
  })),
  rulingsTruncated: z.boolean(),
});

export const cardRulesResponseSchema = z.object({
  data: z.object({ card: cardRulesSchema, source: cardSourceSchema }),
});

export const cardEffectsResponseSchema = z.object({
  data: z.object({
    results: z.array(z.object({
      oracleId: z.string(),
      name: z.string(),
      faceIndex: z.number().int().nonnegative(),
      effectIndex: z.number().int().nonnegative(),
      text: z.string(),
      sourceUrl: z.string().url(),
    })),
    source: cardSourceSchema,
  }),
  meta: z.object({
    pagination: z.object({
      limit: z.number().int().positive(),
      nextCursor: z.string().nullable(),
    }),
  }),
});

export type CardRules = z.infer<typeof cardRulesSchema>;
export type CardSource = z.infer<typeof cardSourceSchema>;

const stateItems = z.array(z.string().trim().min(1).max(500)).max(20);
export const gameStateSchema = z.object({
  active_player: z.string().trim().min(1).max(120).optional(),
  phase: z.string().trim().min(1).max(120).optional(),
  priority_player: z.string().trim().min(1).max(120).optional(),
  battlefield: stateItems.optional(),
  stack: stateItems.describe("Stack objects, in order, stating which resolves next").optional(),
  targets: stateItems.optional(),
  choices: stateItems.optional(),
  relevant_effects: stateItems.optional(),
  additional_context: z.string().trim().min(1).max(2000).optional(),
}).strict().refine((state) => JSON.stringify(state).length <= 8000, {
  message: "game_state must fit within 8000 characters",
});

export type GameState = z.infer<typeof gameStateSchema>;
