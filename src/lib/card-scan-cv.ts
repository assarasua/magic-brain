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
  hash: string;
};

export type ScanGuidance =
  | "move_closer"
  | "hold_steady"
  | "too_dark"
  | "glare"
  | "detected";

export const BULK_SCAN_LIMIT = 24;
export const REQUIRED_STABLE_FRAMES = 4;
export const CAPTURE_COOLDOWN_MS = 1_400;

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
  let darkPixels = 0;
  let glarePixels = 0;
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
    if (value < 40) darkPixels += 1;
    if (value > 247) glarePixels += 1;
    if (previousLuma?.length === luma.length) {
      motionTotal += Math.abs(value - previousLuma[pixel]);
    }
  }

  const verticalEdges = new Array<number>(width).fill(0);
  const horizontalEdges = new Array<number>(height).fill(0);
  let laplacianTotal = 0;
  let samples = 0;
  for (let y = 1; y < height - 1; y += 2) {
    for (let x = 1; x < width - 1; x += 2) {
      const index = y * width + x;
      const horizontal = Math.abs(luma[index + 1] - luma[index - 1]);
      const vertical = Math.abs(luma[index + width] - luma[index - width]);
      verticalEdges[x] += horizontal;
      horizontalEdges[y] += vertical;
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

  return {
    luma,
    metrics: {
      geometry,
      meanLuma: lumaTotal / luma.length,
      darkRatio: darkPixels / luma.length,
      glareRatio: glarePixels / luma.length,
      sharpness: laplacianTotal / Math.max(1, samples),
      motion:
        previousLuma?.length === luma.length
          ? motionTotal / luma.length
          : Number.POSITIVE_INFINITY,
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
} {
  const current = frames.at(-1);
  if (!current?.geometry || current.geometry.coverage < 0.38) {
    return { guidance: "move_closer", ready: false, confidence: 0 };
  }
  if (current.meanLuma < 58 || current.darkRatio > 0.58) {
    return { guidance: "too_dark", ready: false, confidence: 0.15 };
  }
  if (current.glareRatio > 0.13) {
    return { guidance: "glare", ready: false, confidence: 0.25 };
  }
  const stable = geometryIsStable(frames);
  if (!stable || current.motion > 8 || current.sharpness < 7) {
    return { guidance: "hold_steady", ready: false, confidence: 0.5 };
  }
  const confidence = Math.min(
    0.99,
    current.geometry.confidence * 0.65 +
      Math.min(1, current.sharpness / 28) * 0.2 +
      Math.max(0, 1 - current.motion / 8) * 0.15,
  );
  return { guidance: "detected", ready: confidence >= 0.72, confidence };
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
