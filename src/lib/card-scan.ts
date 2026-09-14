import type { CardLanguage } from "@/lib/card-languages";
import {
  normalizeOcrText,
  OCR_LANGUAGE_MODELS,
  parseCollectorHints,
  type CardScanHints,
} from "@/lib/card-scan-model";

export {
  MAX_OCR_TEXT_LENGTH,
  MAX_SCAN_HINT_LENGTH,
  normalizeCollectorNumber,
  normalizeMatchConfidence,
  normalizeOcrText,
  normalizeSetCode,
  OCR_LANGUAGE_MODELS,
  parseCollectorHints,
  parseIdentifyRequest,
} from "@/lib/card-scan-model";

export type CardScanResult = CardScanHints & {
  confidence: number;
};

declare global {
  interface Window {
    __magicBrainTestRecognizeCard?: (
      source: Blob,
      language: CardLanguage,
    ) => Promise<CardScanResult>;
  }
}

async function loadImage(source: Blob) {
  const url = URL.createObjectURL(source);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function prepareCardImage(source: Blob) {
  const image = await loadImage(source);
  const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("image_processing_unavailable");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let index = 0; index < pixels.data.length; index += 4) {
    const luminance =
      pixels.data[index] * 0.299 +
      pixels.data[index + 1] * 0.587 +
      pixels.data[index + 2] * 0.114;
    const enhanced = Math.max(0, Math.min(255, (luminance - 128) * 1.35 + 128));
    pixels.data[index] = enhanced;
    pixels.data[index + 1] = enhanced;
    pixels.data[index + 2] = enhanced;
  }
  context.putImageData(pixels, 0, 0);
  return canvas;
}

export async function recognizeCardImage(
  source: Blob,
  language: CardLanguage,
  onProgress?: (progress: number) => void,
  onWorkerReady?: (terminate: () => Promise<unknown>) => void,
): Promise<{ result: CardScanResult; terminate: () => Promise<unknown> }> {
  if (
    process.env.NODE_ENV !== "production" &&
    typeof window !== "undefined" &&
    window.__magicBrainTestRecognizeCard
  ) {
    return {
      result: await window.__magicBrainTestRecognizeCard(source, language),
      terminate: async () => undefined,
    };
  }
  const [{ createWorker, PSM }, canvas] = await Promise.all([
    import("tesseract.js"),
    prepareCardImage(source),
  ]);
  const worker = await createWorker(OCR_LANGUAGE_MODELS[language], undefined, {
    logger: (message) => {
      if (message.status === "recognizing text") onProgress?.(message.progress);
    },
  });
  onWorkerReady?.(() => worker.terminate());
  try {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
    const width = canvas.width;
    const height = canvas.height;
    const [title, details] = await Promise.all([
      worker.recognize(canvas, {
        rectangle: { left: 0, top: 0, width, height: Math.round(height * 0.24) },
      }),
      worker.recognize(canvas, {
        rectangle: {
          left: 0,
          top: Math.round(height * 0.7),
          width,
          height: Math.round(height * 0.3),
        },
      }),
    ]);
    const text = normalizeOcrText(`${title.data.text} ${details.data.text}`);
    const hints = parseCollectorHints(details.data.text);
    return {
      result: {
        text,
        language,
        ...hints,
        confidence: Math.max(0, Math.min(100, (title.data.confidence + details.data.confidence) / 2)),
      },
      terminate: () => worker.terminate(),
    };
  } catch (error) {
    await worker.terminate();
    throw error;
  }
}
