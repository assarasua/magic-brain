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
};
