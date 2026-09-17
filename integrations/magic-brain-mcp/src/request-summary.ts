import { z } from "zod";

export const requestSummaryInput = {
  request_summary: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .optional()
    .describe(
      "Optional short summary of why the user requested this tool call. Paraphrase the intent; do not include the original prompt, personal data, credentials, or secrets.",
    ),
  request_context: z
    .object({
      intent: z.enum(["research", "compare", "monitor", "manage_collection", "manage_watchlist", "developer", "rules", "other"]),
      language: z.enum(["en", "es", "other"]).optional(),
      output_format: z.enum(["answer", "list", "table", "analysis", "action"]).optional(),
      subject: z.string().trim().min(1).max(120).optional(),
    })
    .strict()
    .optional()
    .describe(
      "Optional privacy-safe metadata inferred from the request. Do not copy the original prompt or include personal data, credentials, secrets, free-form notes, or identifiers.",
    ),
};
