import assert from "node:assert/strict";
import test from "node:test";
import {
  coverVideoRoi,
  mapGeometryToVideo,
} from "./card-scan-viewport.ts";

test("maps a landscape cover stream to the visible portrait guide", () => {
  const roi = coverVideoRoi({
    videoWidth: 1280,
    videoHeight: 720,
    viewportWidth: 630,
    viewportHeight: 880,
  });
  assert.ok(Math.abs(roi.sourceX - 397.73) < 0.02);
  assert.ok(Math.abs(roi.sourceY - 21.6) < 0.02);
  assert.ok(Math.abs(roi.sourceWidth - 484.36) < 0.2);
  assert.ok(Math.abs(roi.sourceHeight - 676.8) < 0.02);
});

test("cover mapping is independent of device pixel ratio", () => {
  const css = coverVideoRoi({
    videoWidth: 1920,
    videoHeight: 1080,
    viewportWidth: 315,
    viewportHeight: 440,
  });
  const doubled = coverVideoRoi({
    videoWidth: 1920,
    videoHeight: 1080,
    viewportWidth: 630,
    viewportHeight: 880,
  });
  assert.deepEqual(css, doubled);
});

test("maps portrait streams and mirrored geometry into video pixels", () => {
  const roi = coverVideoRoi({
    videoWidth: 720,
    videoHeight: 1280,
    viewportWidth: 630,
    viewportHeight: 880,
    mirrored: true,
  });
  const mapped = mapGeometryToVideo(
    {
      corners: [
        { x: 0.1, y: 0.2 },
        { x: 0.9, y: 0.2 },
        { x: 0.9, y: 0.8 },
        { x: 0.1, y: 0.8 },
      ],
      confidence: 0.8,
      coverage: 0.48,
    },
    roi,
  );
  assert.ok(mapped.corners[0].x < mapped.corners[1].x);
  assert.ok(mapped.corners.every((point) => point.x >= 0 && point.x <= 1));
  assert.ok(mapped.corners.every((point) => point.y >= 0 && point.y <= 1));
});
