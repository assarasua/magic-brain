import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_OCR_TEXT_LENGTH,
  OCR_LANGUAGE_MODELS,
  normalizeCollectorNumber,
  normalizeMatchConfidence,
  normalizeOcrText,
  parseCollectorHints,
  parseIdentifyRequest,
} from "./card-scan-model.ts";
import { CARD_LANGUAGES } from "./card-languages.ts";

test("maps every supported printed language to one lazy OCR model", () => {
  assert.deepEqual(
    Object.keys(OCR_LANGUAGE_MODELS).sort(),
    CARD_LANGUAGES.map(({ code }) => code).sort(),
  );
  assert.equal(OCR_LANGUAGE_MODELS.zhs, "chi_sim");
  assert.equal(OCR_LANGUAGE_MODELS.zht, "chi_tra");
});

test("normalizes multilingual OCR while removing controls and unsafe markup", () => {
  assert.equal(
    normalizeOcrText("  Dragón\u0000 <script> 火花  "),
    "Dragón script 火花",
  );
  assert.equal(normalizeOcrText("x".repeat(500)).length, MAX_OCR_TEXT_LENGTH);
});

test("extracts bounded collector and set hints", () => {
  assert.deepEqual(parseCollectorHints("SET: MH2 Collector #233/303"), {
    setCode: "mh2",
    collectorNumber: "233",
  });
  assert.equal(normalizeCollectorNumber("../../DROP TABLE"), "droptable");
});

test("identify requests reject unknown keys, languages, and oversized input", () => {
  assert.equal(parseIdentifyRequest({ text: "Black Lotus", language: "xx" }), null);
  assert.equal(
    parseIdentifyRequest({ text: "Black Lotus", language: "en", photo: "data:" }),
    null,
  );
  assert.equal(
    parseIdentifyRequest({ text: "x".repeat(MAX_OCR_TEXT_LENGTH * 4 + 1), language: "en" }),
    null,
  );
});

test("identify requests normalize accepted OCR hints", () => {
  assert.deepEqual(
    parseIdentifyRequest({
      text: "  Black   Lotus ",
      language: "en",
      setCode: " LEA ",
      collectorNumber: " 233 / 295 ",
    }),
    {
      text: "Black Lotus",
      language: "en",
      setCode: "lea",
      collectorNumber: "233/295",
    },
  );
});

test("exact printing and collector evidence set confidence floors", () => {
  assert.equal(normalizeMatchConfidence(0.2, "exact_print"), 0.9);
  assert.equal(normalizeMatchConfidence(0.2, "collector_match"), 0.65);
  assert.equal(normalizeMatchConfidence(0.42, "name_match"), 0.42);
  assert.equal(normalizeMatchConfidence(5, "name_match"), 1);
});
