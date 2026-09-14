import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import { createWorker } from "tesseract.js";

const root = new URL("../", import.meta.url);
const fixture = JSON.parse(
  await readFile(new URL("test/fixtures/ocr-domain-unseen.json", root), "utf8"),
);
const artifact = JSON.parse(
  await readFile(new URL("public/models/card-title-corrector-v1.json", root), "utf8"),
);

function normalize(value) {
  return value.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

function distance(leftValue, rightValue) {
  const left = normalize(leftValue);
  const right = normalize(rightValue);
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let x = 1; x <= left.length; x += 1) {
    let previous = row[0];
    row[0] = x;
    for (let y = 1; y <= right.length; y += 1) {
      const current = row[y];
      row[y] = Math.min(
        row[y] + 1,
        row[y - 1] + 1,
        previous + (left[x - 1] === right[y - 1] ? 0 : 1),
      );
      previous = current;
    }
  }
  return row[right.length];
}

function rank(text, titles) {
  return titles
    .map((title) => ({ title, score: distance(text, title) }))
    .sort((left, right) => left.score - right.score || left.title.localeCompare(right.title))
    .slice(0, 3);
}

const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const page = await browser.newPage();
const workers = {
  en: await createWorker("eng", undefined, { langPath: "./public/models/tesseract", cacheMethod: "none" }),
  es: await createWorker("spa", undefined, { langPath: "./public/models/tesseract", cacheMethod: "none" }),
};
const results = [];
const started = performance.now();
try {
  for (let index = 0; index < fixture.visualSamples.length; index += 1) {
    const sample = fixture.visualSamples[index];
    const svg = await readFile(
      new URL(`test/fixtures/ocr-title-crops/${String(index).padStart(2, "0")}.svg`, root),
      "utf8",
    );
    await page.setContent(`<img id="crop" src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}">`);
    const png = await page.locator("#crop").screenshot();
    const recognized = await workers[sample.lang].recognize(png);
    const raw = recognized.data.text.trim();
    const ranked = rank(raw, artifact.lexicon[sample.lang]);
    results.push({
      lang: sample.lang,
      expected: sample.title,
      raw,
      rawExact: normalize(raw) === normalize(sample.title),
      lexiconTop1: ranked[0]?.title === sample.title,
      lexiconTop3: ranked.some((candidate) => candidate.title === sample.title),
      confidence: recognized.data.confidence,
    });
  }
} finally {
  await Promise.all(Object.values(workers).map((worker) => worker.terminate()));
  await browser.close();
}
const report = {
  modelVersion: artifact.modelVersion,
  fixtureCount: results.length,
  rawExact: results.filter((result) => result.rawExact).length / results.length,
  lexiconTop1: results.filter((result) => result.lexiconTop1).length / results.length,
  lexiconTop3: results.filter((result) => result.lexiconTop3).length / results.length,
  meanEndToEndLatencyMs: (performance.now() - started) / results.length,
  results,
};
await writeFile(
  new URL("artifacts/ocr/card-title-visual-benchmark.json", root),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(JSON.stringify(report, null, 2));
