#!/usr/bin/env node
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRulesIndex } from "../../src/rules/index.js";
import { parseRulesSource } from "../../src/rules/parser.js";
import type { ExtractedRulesSource } from "../../src/rules/types.js";

const outputDirectory = resolve(
  process.argv[2] ??
    fileURLToPath(new URL("../../rules-data", import.meta.url)),
);
const extractedPath = resolve(outputDirectory, "extracted-pages.json");
const indexPath = resolve(outputDirectory, "rules-index.json");
const temporaryPath = `${indexPath}.${process.pid}.tmp`;

try {
  const extracted = JSON.parse(
    await readFile(extractedPath, "utf8"),
  ) as ExtractedRulesSource;
  const documents = parseRulesSource(extracted);
  const identifiers = new Set<string>();
  for (const document of documents) {
    if (identifiers.has(document.id)) {
      throw new Error(`Duplicate parsed rules identifier: ${document.id}`);
    }
    identifiers.add(document.id);
  }
  const ruleCount = documents.filter(({ kind }) => kind === "rule").length;
  const glossaryCount = documents.length - ruleCount;
  if (ruleCount < 2_000 || glossaryCount < 500) {
    throw new Error(
      `Parsed corpus is unexpectedly small (${ruleCount} rules, ${glossaryCount} glossary entries)`,
    );
  }

  const index = buildRulesIndex(extracted.source, documents);
  await writeFile(temporaryPath, `${JSON.stringify(index)}\n`, { mode: 0o600 });
  await rename(temporaryPath, indexPath);
  console.log(
    `Indexed ${ruleCount} rules and ${glossaryCount} glossary entries to ${indexPath}`,
  );
} finally {
  await rm(temporaryPath, { force: true });
}
