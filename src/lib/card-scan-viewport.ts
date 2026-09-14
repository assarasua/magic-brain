import type { CardGeometry, ScanPoint } from "@/lib/card-scan-cv";

export const CARD_GUIDE_INSET = 0.03;

export type VideoRoi = {
  videoWidth: number;
  videoHeight: number;
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
  mirrored: boolean;
};

export function coverVideoRoi({
  videoWidth,
  videoHeight,
  viewportWidth,
  viewportHeight,
  guideInset = CARD_GUIDE_INSET,
  mirrored = false,
}: {
  videoWidth: number;
  videoHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  guideInset?: number;
  mirrored?: boolean;
}): VideoRoi {
  if (
    videoWidth <= 0 ||
    videoHeight <= 0 ||
    viewportWidth <= 0 ||
    viewportHeight <= 0 ||
    guideInset < 0 ||
    guideInset >= 0.5
  ) {
    throw new Error("invalid_video_viewport");
  }
  const scale = Math.max(
    viewportWidth / videoWidth,
    viewportHeight / videoHeight,
  );
  const visibleWidth = viewportWidth / scale;
  const visibleHeight = viewportHeight / scale;
  const visibleX = (videoWidth - visibleWidth) / 2;
  const visibleY = (videoHeight - visibleHeight) / 2;
  return {
    videoWidth,
    videoHeight,
    sourceX: visibleX + visibleWidth * guideInset,
    sourceY: visibleY + visibleHeight * guideInset,
    sourceWidth: visibleWidth * (1 - guideInset * 2),
    sourceHeight: visibleHeight * (1 - guideInset * 2),
    mirrored,
  };
}

function mapPointToVideo(point: ScanPoint, roi: VideoRoi): ScanPoint {
  const x = roi.mirrored ? 1 - point.x : point.x;
  return {
    x: (roi.sourceX + x * roi.sourceWidth) / roi.videoWidth,
    y: (roi.sourceY + point.y * roi.sourceHeight) / roi.videoHeight,
  };
}

export function mapGeometryToVideo(
  geometry: CardGeometry,
  roi: VideoRoi,
): CardGeometry {
  const corners = roi.mirrored
    ? [
        geometry.corners[1],
        geometry.corners[0],
        geometry.corners[3],
        geometry.corners[2],
      ]
    : geometry.corners;
  return {
    ...geometry,
    corners: corners.map((point) =>
      mapPointToVideo(point, roi),
    ) as CardGeometry["corners"],
  };
}

export function drawVideoRoi(
  context: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  roi: VideoRoi,
  width: number,
  height: number,
) {
  context.save();
  if (roi.mirrored) {
    context.translate(width, 0);
    context.scale(-1, 1);
  }
  context.drawImage(
    video,
    roi.sourceX,
    roi.sourceY,
    roi.sourceWidth,
    roi.sourceHeight,
    0,
    0,
    width,
    height,
  );
  context.restore();
}
