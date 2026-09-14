import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { CARD_TITLE_MODEL_SHA256 } from "./card-title-corrector.ts";

test("domain model is pinned, trained, and evaluated without title leakage", async () => {
  const bytes = await readFile(
    new URL("../../public/models/card-title-corrector-v1.json", import.meta.url),
  );
  const artifact = JSON.parse(bytes.toString("utf8"));
  const evaluation = JSON.parse(
    await readFile(
      new URL("../../artifacts/ocr/card-title-corrector-v1.evaluation.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(createHash("sha256").update(bytes).digest("hex"), CARD_TITLE_MODEL_SHA256);
  assert.equal(artifact.visualRecognizer.name, "Tesseract.js");
  assert.equal(artifact.visualRecognizer.license, "Apache-2.0");
  assert.equal(artifact.trainedComponent, "weighted character-sequence correction model");
  assert.ok(Object.keys(artifact.confusionCosts).length >= 8);
  assert.ok(artifact.source.trainingTitles > 1_000);
  assert.ok(artifact.source.holdoutTitles > 100);
  assert.equal(evaluation.trainTestLeakage, false);
  assert.ok(evaluation.adapted.top1 >= evaluation.baseline.top1);
  assert.ok(evaluation.adapted.top3 >= evaluation.adapted.top1);
});

test("priority OCR assets match pinned checksums", async () => {
  const models = {
    "eng.traineddata.gz": "45b4cb346724ac1774f1c36f42f182b887bcdb28ebe63e6fff90ac41f3fcff91",
    "spa.traineddata.gz": "40be52f97b5d4eb7460073dc1f94cd546b27150333c0bf854ed7e7132db6bceb",
  };
  for (const [filename, expected] of Object.entries(models)) {
    const bytes = await readFile(
      new URL(`../../public/models/tesseract/${filename}`, import.meta.url),
    );
    assert.equal(createHash("sha256").update(bytes).digest("hex"), expected);
  }
});
