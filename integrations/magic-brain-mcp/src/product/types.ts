export const PRODUCT_STATUSES = [
  "shipped_fact",
  "operating_principle",
  "hypothesis",
  "roadmap_option",
  "unknown_not_measured",
] as const;

export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const PRODUCT_TOPICS = [
  "positioning",
  "users_and_alternatives",
  "differentiation_and_moat",
  "metrics_and_demand",
  "monetization",
  "provenance_and_trust",
  "regulatory_and_risk",
  "liquidity_and_signals",
  "incidents_and_corrections",
  "growth",
  "adjacent_tcgs",
] as const;

export type ProductTopic = (typeof PRODUCT_TOPICS)[number];

export type ProductCitation = {
  label: string;
  url: string;
};

export type ProductFact = {
  id: string;
  topic: ProductTopic;
  status: ProductStatus;
  statement: string;
  keywords: string[];
  citations: ProductCitation[];
};

export type ProductKnowledgeResult = {
  query: string;
  results: Array<ProductFact & { score: number }>;
  taxonomy: Record<ProductStatus, string>;
  canonicalDocument: string;
  retrievalNotice: string;
};
