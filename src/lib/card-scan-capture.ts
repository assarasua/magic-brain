import type { CardGeometry, ScanPoint } from "@/lib/card-scan-cv";

const OUTPUT_WIDTH = 756;
const OUTPUT_HEIGHT = 1056;

function interpolate(
  topLeft: ScanPoint,
  topRight: ScanPoint,
  bottomRight: ScanPoint,
  bottomLeft: ScanPoint,
  u: number,
  v: number,
) {
  return {
    x:
      topLeft.x * (1 - u) * (1 - v) +
      topRight.x * u * (1 - v) +
      bottomRight.x * u * v +
      bottomLeft.x * (1 - u) * v,
    y:
      topLeft.y * (1 - u) * (1 - v) +
      topRight.y * u * (1 - v) +
      bottomRight.y * u * v +
      bottomLeft.y * (1 - u) * v,
  };
}

export async function capturePerspectiveCard(
  video: HTMLVideoElement,
  geometry: CardGeometry,
) {
  if (video.videoWidth <= 0 || video.videoHeight <= 0) {
    throw new Error("video_not_ready");
  }
  const sourceScale = Math.min(
    1,
    1600 / Math.max(video.videoWidth, video.videoHeight),
  );
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = Math.round(video.videoWidth * sourceScale);
  sourceCanvas.height = Math.round(video.videoHeight * sourceScale);
  const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
  if (!sourceContext) throw new Error("capture_context_unavailable");
  sourceContext.drawImage(video, 0, 0);
  const source = sourceContext.getImageData(
    0,
    0,
    sourceCanvas.width,
    sourceCanvas.height,
  );

  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = OUTPUT_WIDTH;
  outputCanvas.height = OUTPUT_HEIGHT;
  const outputContext = outputCanvas.getContext("2d");
  if (!outputContext) throw new Error("capture_context_unavailable");
  const output = outputContext.createImageData(OUTPUT_WIDTH, OUTPUT_HEIGHT);
  const [topLeft, topRight, bottomRight, bottomLeft] = geometry.corners;

  for (let y = 0; y < OUTPUT_HEIGHT; y += 1) {
    const v = y / (OUTPUT_HEIGHT - 1);
    for (let x = 0; x < OUTPUT_WIDTH; x += 1) {
      const u = x / (OUTPUT_WIDTH - 1);
      const point = interpolate(topLeft, topRight, bottomRight, bottomLeft, u, v);
      const sourceX = Math.max(
        0,
        Math.min(sourceCanvas.width - 1, Math.round(point.x * sourceCanvas.width)),
      );
      const sourceY = Math.max(
        0,
        Math.min(sourceCanvas.height - 1, Math.round(point.y * sourceCanvas.height)),
      );
      const sourceIndex = (sourceY * sourceCanvas.width + sourceX) * 4;
      const outputIndex = (y * OUTPUT_WIDTH + x) * 4;
      output.data[outputIndex] = source.data[sourceIndex];
      output.data[outputIndex + 1] = source.data[sourceIndex + 1];
      output.data[outputIndex + 2] = source.data[sourceIndex + 2];
      output.data[outputIndex + 3] = 255;
    }
  }
  outputContext.putImageData(output, 0, 0);
  return new Promise<Blob>((resolve, reject) =>
    outputCanvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("capture_failed"))),
      "image/jpeg",
      0.9,
    ),
  );
}
