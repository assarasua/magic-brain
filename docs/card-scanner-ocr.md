# Card scanner OCR and domain adaptation

## Runtime architecture

Bulk scan performs all pixels operations in the browser. A 160×224 analysis
canvas computes grayscale edge projections, card bounds, exposure, highlight
ratio, Laplacian sharpness, frame motion, geometry stability, and a 64-cell
luminance hash. It runs from `requestVideoFrameCallback` where available and a
throttled `requestAnimationFrame` fallback otherwise. The interval adapts from
100–420 ms based on measured analysis cost.

On the development machine, 300 synthetic 160×224 frames averaged 0.33 ms per
analysis with 179,200 bytes of active analysis buffers. The UI intentionally
caps cadence at 10 analyses/second. Perspective capture caps its source surface
at 1,600 px on the longest edge and its output at 756×1056; the queue is capped
at 24 compressed blobs and releases each source blob after OCR.

The production build emitted the scanner UI/CV chunk at 41,855 bytes
(13,487 bytes gzip). OCR language assets and the 826 KB correction artifact are
not part of that initial JavaScript chunk; they load only when scanning starts.

Accepted frames are perspective-normalized to 756×1056 before OCR. Capture does
not stop the camera. A bounded 24-item FIFO runs OCR and catalog lookup in the
background with one persistent worker per scanner session. Object URLs are
revoked and source blobs are released after processing.

No image or video is uploaded. Only bounded normalized OCR text and set/collector
hints use the identification API.

## Visual recognizer choice

The deployed recognizer remains Tesseract.js 6.0.1 with tesseract.js-core 6.1.2
(Apache-2.0), using Tesseract 5 LSTM through WebAssembly. English and Spanish
use the more accurate MIT-licensed `@tesseract.js-data` 1.0.0
`4.0.0_best_int` assets, self-hosted as immutable static files:

- `eng.traineddata.gz`: 2,952,873 bytes, SHA-256
  `45b4cb346724ac1774f1c36f42f182b887bcdb28ebe63e6fff90ac41f3fcff91`
- `spa.traineddata.gz`: 2,100,190 bytes, SHA-256
  `40be52f97b5d4eb7460073dc1f94cd546b27150333c0bf854ed7e7132db6bceb`

The sync command downloads only fixed-version URLs and rejects checksum
mismatches:

```sh
npm run ocr:sync-models
```

PaddleOCR/ONNX was evaluated as a future visual-recognizer option. Its
detector-plus-recognizer graph and ONNX runtime would add another runtime,
larger initial model transfer, and WebGPU/device compatibility branches.
Without a representative physical-device image corpus, claiming an accuracy
improvement would be unsupported. Tesseract's existing browser worker,
language coverage, 5.05 MB combined priority-language assets, permissive
license, and measured session reuse made it the lower-risk production choice.

Other printed languages retain Tesseract's lazy per-language CDN fallback.

## Trained card-title correction

English and Spanish OCR output is passed through
`card-title-corrector-v1-54feffd50c39`, a trained lightweight weighted
character-sequence model. This is separate from its title lexicon:

- the **trained component** learns substitution, deletion, transposition, and
  multi-character confusion costs from deterministic synthetic OCR corruptions;
- the **lexicon/trigram index** only constrains candidate generation;
- exact set, collector number, and language remain authoritative in server-side
  printing resolution.

Training uses distinct EN/ES titles from the configured local `cards` catalog.
The SHA-256 title split reserves bucket zero (20%) for evaluation, so learned
weights never see held-out titles. The pipeline also emits SVG title crops with
serif typography, textured backgrounds, blur, glare, and perspective rotation.
No third-party card image is read or stored.

Rebuild:

```sh
npm run ocr:train
```

An offline JSON input with `{ "lang", "name", "frequency" }` rows is supported
through `node scripts/train-card-title-corrector.mjs --input path.json`.

The browser lazily fetches the 826,304-byte artifact and verifies SHA-256
`b1184cd8b5ff309b0fb99f51a9419f19cebc3fe8751fecc6d076f45de9a07c18`
before building its in-memory trigram index. The checked-in evaluation report
records 80 held-out corrupted samples: simple edit-distance top-1 100%;
adapted top-1 100%; adapted top-3 100%. Candidate scoring averaged 713.06 ms
in the unoptimized offline exhaustive benchmark. Runtime indexing limits
scoring to 60 candidates and is prewarmed while the camera starts. These
synthetic results do not establish physical-card or camera accuracy.

The separate 12-image EN/ES distorted-SVG benchmark measured raw exact OCR at
66.67%, lexicon-assisted top-1 at 83.33%, top-3 at 91.67%, and mean end-to-end
recognition latency of 195.70 ms on the development machine. Run it with
`npm run ocr:benchmark`; detailed per-title output is checked in under
`artifacts/ocr/`. These fixtures are synthetic and deliberately include unseen
titles, blur, glare, texture, and slight rotation.

Rebuild when the EN/ES title corpus hash changes. Review drift by comparing
model version, source hash, holdout metrics, artifact size, and browser latency
before replacing the pinned checksum.
