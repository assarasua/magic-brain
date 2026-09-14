import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import pg from "pg";

const { Client } = pg;
const outputUrl = new URL("../public/models/card-title-corrector-v1.json", import.meta.url);
const reportUrl = new URL("../artifacts/ocr/card-title-corrector-v1.evaluation.json", import.meta.url);
const fixtureUrl = new URL("../test/fixtures/ocr-domain-unseen.json", import.meta.url);
const cropDirectory = new URL("../test/fixtures/ocr-title-crops/", import.meta.url);
const inputArg = process.argv.indexOf("--input");
const inputPath = inputArg >= 0 ? process.argv[inputArg + 1] : null;

function stableNumber(value) {
  return Number.parseInt(createHash("sha256").update(value).digest("hex").slice(0, 8), 16);
}

function normalize(value) {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}' -]/gu, "").replace(/\s+/g, " ").trim();
}

const confusionRules = [
  ["rn", "m"],
  ["cl", "d"],
  ["vv", "w"],
  ["o", "0"],
  ["l", "1"],
  ["é", "e"],
  ["á", "a"],
  ["í", "i"],
  ["ó", "o"],
  ["ú", "u"],
  ["ñ", "n"],
];

function corrupt(title, variant) {
  const normalized = normalize(title);
  const applicable = confusionRules.filter(([truth]) => normalized.includes(truth));
  if (applicable.length > 0) {
    const [truth, observed] = applicable[variant % applicable.length];
    return {
      text: normalized.replace(truth, observed),
      operation: `${observed}>${truth}`,
    };
  }
  if (normalized.length < 4) return { text: normalized, operation: null };
  const index = 1 + (stableNumber(`${title}:${variant}`) % (normalized.length - 2));
  if (variant % 2 === 0) {
    return {
      text: normalized.slice(0, index) + normalized.slice(index + 1),
      operation: `>${normalized[index]}`,
    };
  }
  return {
    text:
      normalized.slice(0, index) +
      normalized[index + 1] +
      normalized[index] +
      normalized.slice(index + 2),
    operation: `${normalized.slice(index, index + 2).split("").reverse().join("")}>${normalized.slice(index, index + 2)}`,
  };
}

function trigrams(value) {
  const padded = `  ${normalize(value)}  `;
  const values = new Set();
  for (let index = 0; index < padded.length - 2; index += 1) {
    values.add(padded.slice(index, index + 3));
  }
  return values;
}

function shortlist(query, titleIndex, limit = 80) {
  const queryGrams = trigrams(query);
  return titleIndex
    .map(({ title, grams: titleGrams }) => {
      let overlap = 0;
      queryGrams.forEach((gram) => {
        if (titleGrams.has(gram)) overlap += 1;
      });
      return { title, overlap };
    })
    .sort((left, right) => right.overlap - left.overlap || left.title.localeCompare(right.title))
    .slice(0, limit)
    .map(({ title }) => title);
}

function distance(observed, truth, costs = {}) {
  const left = normalize(observed);
  const right = normalize(truth);
  const learnedSequences = Object.entries(costs).filter(([operation]) => {
    const [seen, expected] = operation.split(">");
    return seen.length > 1 || expected.length > 1;
  });
  const rows = Array.from({ length: left.length + 1 }, () => new Array(right.length + 1).fill(0));
  for (let x = 0; x <= left.length; x += 1) rows[x][0] = x;
  for (let y = 0; y <= right.length; y += 1) rows[0][y] = y;
  for (let x = 1; x <= left.length; x += 1) {
    for (let y = 1; y <= right.length; y += 1) {
      const substitution = costs[`${left[x - 1]}>${right[y - 1]}`] ?? (left[x - 1] === right[y - 1] ? 0 : 1);
      rows[x][y] = Math.min(
        rows[x - 1][y] + (costs[`>${right[y - 1]}`] ?? 1),
        rows[x][y - 1] + 1,
        rows[x - 1][y - 1] + substitution,
      );
      if (x >= 2 && y >= 2) {
        const observedPair = left.slice(x - 2, x);
        const truthPair = right.slice(y - 2, y);
        rows[x][y] = Math.min(
          rows[x][y],
          rows[x - 2][y - 2] + (costs[`${observedPair}>${truthPair}`] ?? 1.2),
        );
      }
      for (const [operation, cost] of learnedSequences) {
        const [seen, expected] = operation.split(">");
        if (
          seen &&
          expected &&
          left.slice(0, x).endsWith(seen) &&
          right.slice(0, y).endsWith(expected)
        ) {
          rows[x][y] = Math.min(rows[x][y], rows[x - seen.length][y - expected.length] + cost);
        }
      }
    }
  }
  return rows[left.length][right.length] / Math.max(1, right.length);
}

async function loadTitles() {
  if (inputPath) {
    return JSON.parse(await readFile(inputPath, "utf8"));
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL or --input is required");
  }
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  try {
    await client.connect();
    const result = await client.query(
      `select lang, name, count(*)::integer as frequency
       from cards where lang in ('en', 'es')
       group by lang, name order by lang, name`,
    );
    return result.rows;
  } finally {
    await client.end();
  }
}

const rows = await loadTitles();
const usableRows = rows.filter(
  (row) =>
    normalize(row.name).replace(/[^\p{L}]/gu, "").length >= 3 &&
    !/world championships ad/i.test(row.name),
);
const titles = {
  en: [...new Set(usableRows.filter((row) => row.lang === "en").map((row) => row.name))],
  es: [...new Set(usableRows.filter((row) => row.lang === "es").map((row) => row.name))],
};
const allTitles = [...titles.en, ...titles.es];
const titleIndex = allTitles.map((title) => ({ title, grams: trigrams(title) }));
const training = allTitles.filter((title) => stableNumber(title) % 5 !== 0);
const holdout = allTitles.filter((title) => stableNumber(title) % 5 === 0);
const operationCounts = {};
for (const title of training) {
  for (let variant = 0; variant < 4; variant += 1) {
    const sample = corrupt(title, variant);
    if (sample.operation) {
      operationCounts[sample.operation] = (operationCounts[sample.operation] ?? 0) + 1;
    }
  }
}
const maxCount = Math.max(...Object.values(operationCounts), 1);
const confusionCosts = Object.fromEntries(
  Object.entries(operationCounts).map(([operation, count]) => [
    operation,
    Number((0.12 + 0.5 * (1 - count / maxCount)).toFixed(4)),
  ]),
);

const evaluationSamples = holdout
  .flatMap((title) => [0, 1].map((variant) => ({ title, observed: corrupt(title, variant).text })))
  .slice(0, 80);
const visualSamples = [
  ...titles.en.filter((title) => stableNumber(title) % 5 === 0).slice(0, 6).map((title) => ({ title, lang: "en" })),
  ...titles.es.filter((title) => stableNumber(title) % 5 === 0).slice(0, 6).map((title) => ({ title, lang: "es" })),
];
let baselineTop1 = 0;
let adaptedTop1 = 0;
let adaptedTop3 = 0;
const started = performance.now();
for (const sample of evaluationSamples) {
  const candidates = shortlist(sample.observed, titleIndex, 40);
  const baseline = candidates
    .map((title) => ({ title, score: distance(sample.observed, title) }))
    .sort((left, right) => left.score - right.score || left.title.localeCompare(right.title));
  const adapted = candidates
    .map((title) => ({
      title,
      score:
        distance(sample.observed, title) * 0.85 +
        distance(sample.observed, title, confusionCosts) * 0.15,
    }))
    .sort((left, right) => left.score - right.score || left.title.localeCompare(right.title));
  if (baseline[0]?.title === sample.title) baselineTop1 += 1;
  if (adapted[0]?.title === sample.title) adaptedTop1 += 1;
  if (adapted.slice(0, 3).some((candidate) => candidate.title === sample.title)) adaptedTop3 += 1;
}
const evaluationMs = performance.now() - started;
const sourceHash = createHash("sha256")
  .update(usableRows.map((row) => `${row.lang}\t${row.name}\t${row.frequency}`).join("\n"))
  .digest("hex");
const artifact = {
  schemaVersion: 1,
  modelVersion: `card-title-corrector-v1-${sourceHash.slice(0, 12)}`,
  trainedComponent: "weighted character-sequence correction model",
  visualRecognizer: {
    name: "Tesseract.js",
    version: "6.0.1",
    coreVersion: "6.1.2",
    license: "Apache-2.0",
    engine: "Tesseract 5 LSTM via WebAssembly",
  },
  source: {
    kind: "local imported catalog metadata",
    languages: ["en", "es"],
    sourceHash,
    trainingTitles: training.length,
    holdoutTitles: holdout.length,
    split: "sha256(normalized title) modulo 5; bucket 0 held out",
    imagesIncluded: false,
  },
  confusionCosts,
  lexicon: titles,
};
const serialized = `${JSON.stringify(artifact)}\n`;
const artifactSha256 = createHash("sha256").update(serialized).digest("hex");
const evaluation = {
  modelVersion: artifact.modelVersion,
  artifactSha256,
  samples: evaluationSamples.length,
  baseline: { name: "unit-cost edit distance", top1: baselineTop1 / evaluationSamples.length },
  adapted: {
    name: "trained weighted sequence correction",
    top1: adaptedTop1 / evaluationSamples.length,
    top3: adaptedTop3 / evaluationSamples.length,
  },
  meanCandidateLatencyMs: evaluationMs / Math.max(1, evaluationSamples.length),
  trainTestLeakage: false,
};
await mkdir(new URL("../public/models/", import.meta.url), { recursive: true });
await mkdir(new URL("../artifacts/ocr/", import.meta.url), { recursive: true });
await mkdir(new URL("../test/fixtures/", import.meta.url), { recursive: true });
await rm(cropDirectory, { recursive: true, force: true });
await mkdir(cropDirectory, { recursive: true });
await writeFile(outputUrl, serialized);
await writeFile(reportUrl, `${JSON.stringify(evaluation, null, 2)}\n`);
await writeFile(
  fixtureUrl,
  `${JSON.stringify({ split: artifact.source.split, samples: evaluationSamples.slice(0, 24), visualSamples }, null, 2)}\n`,
);
await Promise.all(
  visualSamples.map(async (sample, index) => {
    const escaped = sample.title
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
    const angle = ((stableNumber(sample.title) % 7) - 3) * 0.45;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="170" viewBox="0 0 720 170">
  <defs>
    <filter id="distort"><feTurbulence baseFrequency=".012" numOctaves="2" seed="${index + 7}" result="noise"/><feDisplacementMap in="SourceGraphic" in2="noise" scale="1.8"/><feGaussianBlur stdDeviation=".35"/></filter>
    <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#dfd4bb"/><stop offset=".5" stop-color="#f2ead8"/><stop offset="1" stop-color="#b8aa8e"/></linearGradient>
    <radialGradient id="glare"><stop stop-color="#fff" stop-opacity=".42"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="720" height="170" rx="14" fill="url(#paper)"/>
  <g transform="translate(28 104) rotate(${angle} 330 0)" filter="url(#distort)">
    <text font-family="Georgia, Times New Roman, serif" font-weight="700" font-size="48" fill="#16130f">${escaped}</text>
  </g>
  <ellipse cx="${480 + index * 7}" cy="48" rx="150" ry="46" fill="url(#glare)" transform="rotate(-16 480 48)"/>
</svg>\n`;
    await writeFile(
      new URL(`${String(index).padStart(2, "0")}.svg`, cropDirectory),
      svg,
    );
  }),
);
console.log(JSON.stringify({ ...evaluation, artifactBytes: Buffer.byteLength(serialized) }, null, 2));
