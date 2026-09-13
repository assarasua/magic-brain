import type {
  ExtractedPage,
  ExtractedRulesSource,
  RulesDocument,
} from "./types.js";

const RULE_PATTERN = /^(\d{3}(?:\.\d+)+(?:[a-z])?)\.?\s+([\s\S]+)$/;
const SECTION_PATTERN = /^(\d{3})\.\s+([A-Z][^.!?]{1,100})$/;
const CHAPTER_PATTERN = /^([1-9])\.\s+([A-Z][^.!?]{1,100})$/;
const GLOSSARY_DEFINITION_START =
  /^(.*?\S)\s+(?=(?:A|An|The|To|See|One|Any|In|This|When|What|Everything|[1-9]\.)\s)([\s\S]+)$/;

export function parseRulesSource(source: ExtractedRulesSource): RulesDocument[] {
  const documents: RulesDocument[] = [];
  let chapter = "Comprehensive Rules";
  let section = "Comprehensive Rules";
  let inGlossary = false;
  let lastDocument: RulesDocument | undefined;

  for (const page of [...source.pages].sort((a, b) => a.page - b.page)) {
    validatePage(page);
    const text = normalizeText(page.text);
    if (!inGlossary && /^Glossary(?:\s{2,}|$)/.test(text) && page.page > 5) {
      inGlossary = true;
    }
    if (inGlossary && /^Credits(?:\s{2,}|$)/.test(text)) {
      break;
    }

    const blocks = text
      .split(/\s{2,}/)
      .map((block) => block.trim())
      .filter(Boolean);

    for (const rawBlock of blocks) {
      const block = rawBlock === "Glossary" ? "" : rawBlock;
      if (!block || block === "Contents" || block === "Credits") {
        continue;
      }

      if (inGlossary) {
        const parsed = parseGlossaryBlock(block);
        if (parsed) {
          lastDocument = {
            id: `glossary:${slug(parsed.term)}`,
            kind: "glossary",
            glossaryTerm: parsed.term,
            section: "Glossary",
            page: page.page,
            text: parsed.definition,
          };
          documents.push(lastDocument);
        } else if (lastDocument?.kind === "glossary") {
          lastDocument.text = joinText(lastDocument.text, block);
        }
        continue;
      }

      const chapterMatch = block.match(CHAPTER_PATTERN);
      if (chapterMatch && Number(chapterMatch[1]) < 10) {
        chapter = `${chapterMatch[1]}. ${chapterMatch[2]}`;
        section = chapter;
        lastDocument = undefined;
        continue;
      }

      const sectionMatch = block.match(SECTION_PATTERN);
      if (sectionMatch) {
        section = `${sectionMatch[1]}. ${sectionMatch[2]}`;
        lastDocument = undefined;
        continue;
      }

      const ruleMatch = block.match(RULE_PATTERN);
      if (ruleMatch) {
        lastDocument = {
          id: `rule:${ruleMatch[1]}`,
          kind: "rule",
          ruleNumber: ruleMatch[1]!,
          section: section === "Comprehensive Rules" ? chapter : section,
          page: page.page,
          text: ruleMatch[2]!,
        };
        documents.push(lastDocument);
      } else if (lastDocument?.kind === "rule") {
        lastDocument.text = joinText(lastDocument.text, block);
      }
    }
  }

  if (!documents.some(({ kind }) => kind === "rule")) {
    throw new Error("No numbered rules were found in the extracted source");
  }
  if (!documents.some(({ kind }) => kind === "glossary")) {
    throw new Error("No glossary entries were found in the extracted source");
  }

  return documents;
}

function parseGlossaryBlock(
  block: string,
): { term: string; definition: string } | undefined {
  const match = block.match(GLOSSARY_DEFINITION_START);
  if (!match) return undefined;
  const term = match[1]!.trim();
  const definition = match[2]!.trim();
  if (
    term.length > 80 ||
    definition.length < 4 ||
    /[.!?]$/.test(term) ||
    /^\d/.test(term)
  ) {
    return undefined;
  }
  return { term, definition };
}

function normalizeText(text: string): string {
  return text
    .replace(/\u0000/g, "")
    .replace(/\r/g, "")
    .replace(/\s{2,}/g, "\u241e")
    .replace(/[ \t]+/g, " ")
    .replace(/\u241e/g, "  ")
    .trim();
}

function joinText(left: string, right: string): string {
  return `${left.trim()} ${right.trim()}`.replace(/\s+/g, " ");
}

function slug(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function validatePage(page: ExtractedPage): void {
  if (!Number.isInteger(page.page) || page.page < 1) {
    throw new Error(`Invalid extracted page number: ${page.page}`);
  }
  if (typeof page.text !== "string") {
    throw new Error(`Page ${page.page} has no text`);
  }
}
