import { query } from "@/lib/db";
import { createPriceHistoryReader } from "@/lib/price-history-core";

export const getPriceHistory = createPriceHistoryReader(query);
