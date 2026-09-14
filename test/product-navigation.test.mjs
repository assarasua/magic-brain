import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import {
  navigationGroups,
  proNavigation,
  routeIsActive,
} from "../src/components/product-navigation.ts";

test("navigation keeps Pro first and groups every destination once", () => {
  assert.deepEqual(
    proNavigation.map(({ label, href }) => [label, href]),
    [
      ["Predict", "/predict"],
      ["Collection Curator", "/brain"],
      ["Brain Signals", "/signals"],
      ["Ask Brain", "/analyst"],
      ["Discover", "/discover"],
    ],
  );
  assert.deepEqual(
    navigationGroups.map(({ label }) => label),
    ["Market Intelligence", "Collection", "Resources", "Account"],
  );

  const hrefs = [
    ...proNavigation.map(({ href }) => href),
    ...navigationGroups.flatMap(({ links }) =>
      links.map(({ href }) => href),
    ),
  ];

  assert.equal(new Set(hrefs).size, hrefs.length);
  assert.equal(hrefs.includes("/brain-pro"), false);

  for (const href of hrefs) {
    const page = href === "/" ? "src/app/page.tsx" : `src/app${href}/page.tsx`;
    assert.equal(existsSync(new URL(`../${page}`, import.meta.url)), true, page);
  }
});

test("active-route matching respects segment boundaries", () => {
  assert.equal(routeIsActive("/", "/"), true);
  assert.equal(routeIsActive("/news/2026-09-13", "/news"), true);
  assert.equal(routeIsActive("/marketplace", "/market"), false);
});
