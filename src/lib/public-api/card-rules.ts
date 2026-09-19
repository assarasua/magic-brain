import { query } from "@/lib/db";
import { createCardRulesReader } from "./card-rules-core";

export const { getCardRules, searchCardEffects } = createCardRulesReader(query);
