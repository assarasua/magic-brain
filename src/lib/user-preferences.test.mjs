import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/card-filters") {
      return {
        shortCircuit: true,
        url: new URL("./card-filters.ts", import.meta.url).href,
      };
    }
    return nextResolve(specifier, context);
  },
});

const {
  defaultUserPreferences,
  normalizeUserPreferences,
  parseUserPreferences,
} = await import("./user-preferences.ts");

test("canonical preferences round trip every persisted onboarding field", () => {
  const profile = {
    defaultBudget: 2400,
    maxCardPrice: 320,
    positions: 12,
    risk: "growth",
    horizon: "long",
    strategy: "momentum",
    marketTrend: "recovering",
    releaseEra: "classic",
    colors: ["U", "B"],
    rarities: ["rare", "mythic"],
    cardTypes: ["Creature", "Artifact"],
    setCodes: ["lea", "mh3"],
    reservedOnly: true,
  };

  const parsed = parseUserPreferences(JSON.parse(JSON.stringify(profile)));
  assert.deepEqual(parsed, profile);
  assert.deepEqual(Object.keys(parsed).sort(), Object.keys(defaultUserPreferences).sort());
});

test("strict preference parsing rejects partial, coerced, and inconsistent profiles", () => {
  assert.equal(parseUserPreferences({ ...defaultUserPreferences, risk: "unknown" }), null);
  assert.equal(parseUserPreferences({ ...defaultUserPreferences, positions: "10" }), null);
  assert.equal(parseUserPreferences({ ...defaultUserPreferences, maxCardPrice: 1200 }), null);
  const partial = { ...defaultUserPreferences };
  delete partial.marketTrend;
  assert.equal(parseUserPreferences(partial), null);
});

test("stored legacy preferences normalize into the canonical complete shape", () => {
  const normalized = normalizeUserPreferences({
    defaultBudget: "500",
    positions: 99,
    colors: ["U", "invalid", "U"],
    setCodes: [" MH3 ", "bad code"],
  });

  assert.deepEqual(normalized, {
    ...defaultUserPreferences,
    defaultBudget: 500,
    positions: 20,
    colors: ["U"],
    rarities: [],
    setCodes: ["mh3"],
  });
  assert.deepEqual(parseUserPreferences(normalized), normalized);
});
