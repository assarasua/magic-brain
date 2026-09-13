export const RULES_INDEX_SCHEMA_VERSION = 1 as const;

export type RulesDocumentKind = "rule" | "glossary";

export interface ExtractedPage {
  page: number;
  text: string;
}

export interface RulesSourceMetadata {
  sourceUrl: string;
  rulesPageUrl: string;
  version: string;
  effectiveDate: string;
  sha256: string;
  fetchedAt: string;
  pageCount: number;
  contentLength: number;
  etag?: string;
  lastModified?: string;
  extractor: string;
}

export interface ExtractedRulesSource {
  source: RulesSourceMetadata;
  pages: ExtractedPage[];
}

export interface RulesDocument {
  id: string;
  kind: RulesDocumentKind;
  ruleNumber?: string;
  glossaryTerm?: string;
  section: string;
  page: number;
  text: string;
}

export interface RulesPosting {
  document: number;
  termFrequency: number;
}

export interface RulesIndex {
  schemaVersion: typeof RULES_INDEX_SCHEMA_VERSION;
  source: RulesSourceMetadata;
  documents: RulesDocument[];
  averageDocumentLength: number;
  documentLengths: number[];
  postings: Record<string, RulesPosting[]>;
}

export interface RulesCitation {
  ruleNumber?: string;
  glossaryTerm?: string;
  section: string;
  page: number;
  sourceUrl: string;
}

export interface RulesSearchHit {
  score: number;
  excerpt: string;
  citation: RulesCitation;
}
