import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

const readSurface = () =>
  readFile(
    new URL("src/components/portfolio-decision-section.tsx", root),
    "utf8",
  );

test("decision cards open the shared card detail experience", async () => {
  const source = await readSurface();

  assert.match(source, /useCardDetail\(\)/);
  assert.match(source, /\.\.\.cardSurfaceProps\(candidate\.id\)/);
  assert.match(source, /\.\.\.cardSurfaceProps\(holding\.cardId\)/);
  assert.match(source, /onClick=\{\(\) => openCard\(candidate\.id\)\}/);
  assert.match(source, /onClick=\{\(\) => openCard\(holding\.cardId\)\}/);
});

test("decision actions are siblings inside article surfaces, never nested buttons", async () => {
  const source = await readSurface();

  assert.match(source, /<article[\s\S]*\.\.\.cardSurfaceProps/);
  assert.doesNotMatch(source, /<button[^>]*>\s*<button/);
  assert.match(source, /onAddCandidate\(candidate, index \+ 1, destination\)/);
  assert.match(source, /onWatchCandidate\(candidate\)/);
  assert.match(source, /onEditHolding\(holding\)/);
  assert.match(source, /onManageHolding\(holding, "move"\)/);
  assert.match(source, /onManageHolding\(holding, "copy"\)/);
  assert.match(source, /onToggleHolding\(holding\.id\)/);
});

test("fallback and verified ML states are visually distinct", async () => {
  const source = await readSurface();

  assert.match(source, /data\.ranking\.source === "ml_batch"/);
  assert.match(source, /Transparent rules/);
  assert.match(source, /Verified ML/);
  assert.match(source, /Fallback active:/);
  assert.doesNotMatch(source, /No learned candidates/);
});

test("empty states distinguish holdings, pricing, thresholds, and discovery paths", async () => {
  const source = await readSurface();

  assert.match(source, /Your portfolio has no holdings yet/);
  assert.match(source, /Current prices are missing/);
  assert.match(source, /No candidates pass the rules/);
  assert.match(source, /No useful review yet/);
  assert.match(source, /href="\/signals"/);
  assert.match(source, /href="\/discover"/);
});

test("surface includes loading, error, imagery fallback, and responsive affordances", async () => {
  const source = await readSurface();
  const css = await readFile(
    new URL(
      "src/components/portfolio-decision-section.module.css",
      root,
    ),
    "utf8",
  );

  assert.match(source, /aria-busy="true"/);
  assert.match(source, /role="alert"/);
  assert.match(source, /ImageOff/);
  assert.match(css, /scroll-snap-type: x proximity/);
  assert.match(css, /\.card:focus-visible/);
  assert.match(css, /@media \(max-width: 640px\)/);
});
