export type ScanPoint = { x: number; y: number };

export type CardGeometry = {
  corners: [ScanPoint, ScanPoint, ScanPoint, ScanPoint];
  confidence: number;
  coverage: number;
};

export type FrameMetrics = {
  geometry: CardGeometry | null;
  meanLuma: number;
  darkRatio: number;
  glareRatio: number;
  sharpness: number;
  motion: number;
  guideConfidence: number;
  skinRatio: number;
  hash: string;
};

export type ScanGuidance =
  | "move_closer"
  | "align_card"
  | "hold_steady"
  | "too_dark"
  | "glare"
  | "detected";

export const BULK_SCAN_LIMIT = 24;
export const REQUIRED_STABLE_FRAMES = 4;
export const FALLBACK_STABLE_FRAMES = 8;
export const CAPTURE_COOLDOWN_MS = 1_400;

export type CaptureBlockReason =
  | "card_not_in_guide"
  | "moderate_contour"
  | "too_dark"
  | "glare"
  | "moving"
  | "blurry"
  | "stabilizing"
  | "ready";

function rangePeak(values: number[], start: number, end: number) {
  let index = start;
  let value = -1;
  for (let cursor = start; cursor <= end; cursor += 1) {
    if (values[cursor] > value) {
      value = values[cursor];
      index = cursor;
    }
  }
  return { index, value };
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

export function analyzeCardFrame(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  previousLuma?: Uint8Array,
): { metrics: FrameMetrics; luma: Uint8Array } {
  if (width < 24 || height < 32 || rgba.length < width * height * 4) {
    throw new Error("invalid_frame");
  }

  const luma = new Uint8Array(width * height);
  let lumaTotal = 0;
  let lumaSquaredTotal = 0;
  let darkPixels = 0;
  let glarePixels = 0;
  let skinPixels = 0;
  let motionTotal = 0;
  for (let pixel = 0; pixel < luma.length; pixel += 1) {
    const source = pixel * 4;
    const value = Math.round(
      rgba[source] * 0.299 +
      rgba[source + 1] * 0.587 +
      rgba[source + 2] * 0.114,
    );
    luma[pixel] = value;
    lumaTotal += value;
    lumaSquaredTotal += value * value;
    if (value < 40) darkPixels += 1;
    if (value > 247) glarePixels += 1;
    const red = rgba[source];
    const green = rgba[source + 1];
    const blue = rgba[source + 2];
    if (
      red > 95 &&
      green > 40 &&
      blue > 20 &&
      Math.max(red, green, blue) - Math.min(red, green, blue) > 15 &&
      Math.abs(red - green) > 15 &&
      red > green &&
      red > blue
    ) {
      skinPixels += 1;
    }
    if (previousLuma?.length === luma.length) {
      motionTotal += Math.abs(value - previousLuma[pixel]);
    }
  }

  const verticalEdges = new Array<number>(width).fill(0);
  const horizontalEdges = new Array<number>(height).fill(0);
  let laplacianTotal = 0;
  let samples = 0;
  let edgePixels = 0;
  let structuredEdgePixels = 0;
  for (let y = 1; y < height - 1; y += 2) {
    for (let x = 1; x < width - 1; x += 2) {
      const index = y * width + x;
      const horizontal = Math.abs(luma[index + 1] - luma[index - 1]);
      const vertical = Math.abs(luma[index + width] - luma[index - width]);
      verticalEdges[x] += horizontal;
      horizontalEdges[y] += vertical;
      if (horizontal + vertical > 30) {
        edgePixels += 1;
        if (y < height * 0.28 || y > height * 0.68) {
          structuredEdgePixels += 1;
        }
      }
      laplacianTotal += Math.abs(
        luma[index] * 4 -
        luma[index - 1] -
        luma[index + 1] -
        luma[index - width] -
        luma[index + width],
      );
      samples += 1;
    }
  }

  const left = rangePeak(verticalEdges, Math.floor(width * 0.03), Math.floor(width * 0.42));
  const right = rangePeak(verticalEdges, Math.floor(width * 0.58), Math.floor(width * 0.97));
  const top = rangePeak(horizontalEdges, Math.floor(height * 0.03), Math.floor(height * 0.38));
  const bottom = rangePeak(horizontalEdges, Math.floor(height * 0.62), Math.floor(height * 0.97));
  const edgeBaseline =
    (average(verticalEdges) + average(horizontalEdges)) / 2;
  const cardWidth = right.index - left.index;
  const cardHeight = bottom.index - top.index;
  const aspect = cardWidth / Math.max(1, cardHeight);
  const coverage = (cardWidth * cardHeight) / (width * height);
  const edgeStrength =
    (left.value + right.value + top.value + bottom.value) /
    Math.max(1, edgeBaseline * 4);
  const aspectScore = Math.max(0, 1 - Math.abs(aspect - 63 / 88) / 0.32);
  const geometryConfidence = Math.min(1, aspectScore * 0.65 + Math.min(1, edgeStrength / 5) * 0.35);
  const geometry =
    cardWidth > width * 0.42 &&
    cardHeight > height * 0.52 &&
    coverage > 0.28 &&
    edgeStrength >= 1.5 &&
    geometryConfidence >= 0.58
      ? {
          corners: [
            { x: left.index / width, y: top.index / height },
            { x: right.index / width, y: top.index / height },
            { x: right.index / width, y: bottom.index / height },
            { x: left.index / width, y: bottom.index / height },
          ] as [ScanPoint, ScanPoint, ScanPoint, ScanPoint],
          confidence: geometryConfidence,
          coverage,
        }
      : null;
  const meanLuma = lumaTotal / luma.length;
  const deviation = Math.sqrt(
    Math.max(0, lumaSquaredTotal / luma.length - meanLuma * meanLuma),
  );
  const edgeDensity = edgePixels / Math.max(1, samples);
  const structuredRatio = structuredEdgePixels / Math.max(1, edgePixels);
  const varianceScore = Math.max(0, Math.min(1, (deviation - 14) / 34));
  const edgeScore = Math.max(0, Math.min(1, (edgeDensity - 0.035) / 0.2));
  const structureScore = Math.max(
    0,
    Math.min(1, (structuredRatio - 0.34) / 0.34),
  );
  const skinRatio = skinPixels / luma.length;
  const skinPenalty = Math.max(0, Math.min(0.75, (skinRatio - 0.12) * 3));
  const guideConfidence = Math.max(
    0,
    Math.min(
      0.9,
      (varianceScore * 0.35 + edgeScore * 0.45 + structureScore * 0.2) *
        (1 - skinPenalty),
    ),
  );

  return {
    luma,
    metrics: {
      geometry,
      meanLuma,
      darkRatio: darkPixels / luma.length,
      glareRatio: glarePixels / luma.length,
      sharpness: laplacianTotal / Math.max(1, samples),
      motion:
        previousLuma?.length === luma.length
          ? motionTotal / luma.length
          : Number.POSITIVE_INFINITY,
      guideConfidence,
      skinRatio,
      hash: averageHash(luma, width, height),
    },
  };
}

export function averageHash(luma: Uint8Array, width: number, height: number) {
  const buckets: number[] = [];
  for (let row = 0; row < 8; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      const x = Math.min(width - 1, Math.floor(((column + 0.5) * width) / 8));
      const y = Math.min(height - 1, Math.floor(((row + 0.5) * height) / 8));
      buckets.push(luma[y * width + x]);
    }
  }
  return buckets
    .map((value) => Math.round(value / 17).toString(16))
    .join("");
}

export function hashDistance(left: string, right: string) {
  if (left.length !== right.length) return Number.POSITIVE_INFINITY;
  let distance = 0;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) distance += 1;
  }
  return distance;
}

export function geometryIsStable(frames: FrameMetrics[]) {
  const recent = frames.slice(-REQUIRED_STABLE_FRAMES);
  if (recent.length < REQUIRED_STABLE_FRAMES || recent.some((frame) => !frame.geometry)) {
    return false;
  }
  const first = recent[0].geometry!;
  return recent.every((frame) =>
    frame.geometry!.corners.every((corner, index) => {
      const baseline = first.corners[index];
      return Math.hypot(corner.x - baseline.x, corner.y - baseline.y) <= 0.025;
    }),
  );
}

export function evaluateCapture(frames: FrameMetrics[]): {
  guidance: ScanGuidance;
  ready: boolean;
  confidence: number;
  reason: CaptureBlockReason;
  fallback: boolean;
} {
  const current = frames.at(-1);
  if (!current) {
    return {
      guidance: "move_closer",
      ready: false,
      confidence: 0,
      reason: "card_not_in_guide",
      fallback: false,
    };
  }
  if (current.meanLuma < 58 || current.darkRatio > 0.58) {
    return { guidance: "too_dark", ready: false, confidence: 0.15, reason: "too_dark", fallback: false };
  }
  if (current.glareRatio > 0.13) {
    return { guidance: "glare", ready: false, confidence: 0.25, reason: "glare", fallback: false };
  }
  const hasStrongGeometry =
    Boolean(current.geometry) && current.geometry!.coverage >= 0.38;
  const isGuideCandidate =
    current.guideConfidence >= 0.54 &&
    current.skinRatio < 0.2 &&
    current.sharpness >= 5;
  if (!hasStrongGeometry && !isGuideCandidate) {
    return {
      guidance: current.guideConfidence > 0.2 ? "align_card" : "move_closer",
      ready: false,
      confidence: current.guideConfidence,
      reason: "card_not_in_guide",
      fallback: false,
    };
  }
  const fallback = !hasStrongGeometry;
  const stable = fallback
    ? frames.slice(-FALLBACK_STABLE_FRAMES).length === FALLBACK_STABLE_FRAMES &&
      frames
        .slice(-FALLBACK_STABLE_FRAMES)
        .every(
          (frame) =>
            frame.guideConfidence >= 0.54 &&
            frame.skinRatio < 0.2 &&
            frame.motion <= 4,
        )
    : geometryIsStable(frames);
  if (current.motion > (fallback ? 4 : 8)) {
    return { guidance: "hold_steady", ready: false, confidence: Math.max(0.45, current.guideConfidence), reason: "moving", fallback };
  }
  if (current.sharpness < (fallback ? 5 : 7)) {
    return { guidance: "hold_steady", ready: false, confidence: Math.max(0.4, current.guideConfidence), reason: "blurry", fallback };
  }
  if (!stable) {
    return { guidance: "hold_steady", ready: false, confidence: Math.max(0.5, current.guideConfidence), reason: fallback ? "moderate_contour" : "stabilizing", fallback };
  }
  const confidence = Math.min(
    fallback ? 0.82 : 0.99,
    (fallback ? current.guideConfidence : current.geometry!.confidence) * 0.65 +
      Math.min(1, current.sharpness / 28) * 0.2 +
      Math.max(0, 1 - current.motion / (fallback ? 4 : 8)) * 0.15,
  );
  const ready = confidence >= (fallback ? 0.66 : 0.72);
  return {
    guidance: ready ? "detected" : "hold_steady",
    ready,
    confidence,
    reason: ready ? "ready" : fallback ? "moderate_contour" : "stabilizing",
    fallback,
  };
}

export type DedupeState = {
  lastHash: string | null;
  lastCapturedAt: number;
  departedFrames: number;
};

export function updateDeparture(state: DedupeState, cardPresent: boolean): DedupeState {
  if (cardPresent) return state;
  return {
    ...state,
    departedFrames: Math.min(10, state.departedFrames + 1),
  };
}

export function canAutoCapture(
  state: DedupeState,
  hash: string,
  now: number,
): boolean {
  if (now - state.lastCapturedAt < CAPTURE_COOLDOWN_MS) return false;
  if (!state.lastHash) return true;
  return state.departedFrames >= 3 || hashDistance(state.lastHash, hash) >= 10;
}

export function recordCapture(
  state: DedupeState,
  hash: string,
  now: number,
): DedupeState {
  return { ...state, lastHash: hash, lastCapturedAt: now, departedFrames: 0 };
}

export function adaptiveAnalysisDelay(durationMs: number, currentDelayMs: number) {
  if (durationMs > 45) return Math.min(420, currentDelayMs + 40);
  if (durationMs < 18) return Math.max(100, currentDelayMs - 10);
  return currentDelayMs;
}
