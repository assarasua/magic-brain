import assert from "node:assert/strict";
import test from "node:test";
import {
  adaptiveAnalysisDelay,
  analyzeCardFrame,
  canAutoCapture,
  evaluateCapture,
  geometryIsStable,
  hashDistance,
  recordCapture,
  updateDeparture,
} from "./card-scan-cv.ts";

function cardFrame({ dark = false, glare = false, offset = 0 } = {}) {
  const width = 160;
  const height = 224;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const inside = x >= 22 + offset && x <= 138 + offset && y >= 22 && y <= 202;
      const border = inside && (x <= 25 + offset || x >= 135 + offset || y <= 25 || y >= 199);
      let value = inside ? 155 : 72;
      if (border) value = 12;
      if (inside && (x + y) % 19 < 3) value = 55;
      if (dark) value = Math.round(value * 0.2);
      if (glare && inside && x > 70 && x < 120 && y > 50 && y < 160) value = 255;
      const index = (y * width + x) * 4;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }
  }
  return { data, width, height };
}

test("detects card bounds and stable geometry", () => {
  const source = cardFrame();
  let previous;
  const frames = Array.from({ length: 4 }, () => {
    const result = analyzeCardFrame(source.data, source.width, source.height, previous);
    previous = result.luma;
    return result.metrics;
  });
  assert.ok(frames[0].geometry);
  assert.ok(frames[0].geometry.coverage > 0.35);
  assert.equal(geometryIsStable(frames), true);
  assert.equal(evaluateCapture(frames).guidance, "detected");
  assert.equal(evaluateCapture(frames).ready, true);
});

test("quality gates darkness, glare, blur, and motion", () => {
  const base = analyzeCardFrame(...Object.values(cardFrame())).metrics;
  const geometry = base.geometry;
  assert.ok(geometry);
  const frames = (override) =>
    Array.from({ length: 4 }, () => ({
      ...base,
      geometry,
      motion: 0,
      sharpness: 20,
      ...override,
    }));
  assert.equal(evaluateCapture(frames({ meanLuma: 30, darkRatio: 0.8 })).guidance, "too_dark");
  assert.equal(evaluateCapture(frames({ glareRatio: 0.3 })).guidance, "glare");
  assert.equal(evaluateCapture(frames({ sharpness: 2 })).guidance, "hold_steady");
  assert.equal(evaluateCapture(frames({ motion: 20 })).ready, false);
});

test("stable textured guide permits a slower moderate-contour fallback", () => {
  const fallbackFrame = {
    geometry: null,
    meanLuma: 126,
    darkRatio: 0.08,
    glareRatio: 0.01,
    sharpness: 14,
    motion: 1,
    guideConfidence: 0.72,
    skinRatio: 0.03,
    hash: "7".repeat(64),
  };
  const early = evaluateCapture(Array.from({ length: 7 }, () => fallbackFrame));
  assert.equal(early.ready, false);
  assert.equal(early.reason, "moderate_contour");
  const ready = evaluateCapture(Array.from({ length: 8 }, () => fallbackFrame));
  assert.equal(ready.ready, true);
  assert.equal(ready.fallback, true);
});

test("fallback rejects empty and person-like guide content", () => {
  const base = {
    geometry: null,
    meanLuma: 126,
    darkRatio: 0.08,
    glareRatio: 0.01,
    sharpness: 14,
    motion: 1,
    hash: "7".repeat(64),
  };
  const empty = Array.from({ length: 10 }, () => ({
    ...base,
    guideConfidence: 0.12,
    skinRatio: 0,
  }));
  const person = Array.from({ length: 10 }, () => ({
    ...base,
    guideConfidence: 0.7,
    skinRatio: 0.31,
  }));
  assert.equal(evaluateCapture(empty).ready, false);
  assert.equal(evaluateCapture(person).ready, false);
});

test("capture gating requires cooldown or card departure", () => {
  let state = { lastHash: null, lastCapturedAt: 0, departedFrames: 3 };
  assert.equal(canAutoCapture(state, "0".repeat(64), 2_000), true);
  state = recordCapture(state, "0".repeat(64), 2_000);
  assert.equal(canAutoCapture(state, "0".repeat(64), 2_500), false);
  assert.equal(canAutoCapture(state, "0".repeat(64), 4_000), false);
  state = updateDeparture(updateDeparture(updateDeparture(state, false), false), false);
  assert.equal(canAutoCapture(state, "0".repeat(64), 4_000), true);
  assert.equal(hashDistance("0".repeat(64), "1".repeat(64)), 64);
});

test("analysis cadence adapts without exceeding bounds", () => {
  assert.equal(adaptiveAnalysisDelay(60, 140), 180);
  assert.equal(adaptiveAnalysisDelay(5, 100), 100);
  assert.equal(adaptiveAnalysisDelay(80, 400), 420);
});
