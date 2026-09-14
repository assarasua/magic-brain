import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

const models = [
  {
    language: "eng",
    url: "https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int/eng.traineddata.gz",
    sha256: "45b4cb346724ac1774f1c36f42f182b887bcdb28ebe63e6fff90ac41f3fcff91",
  },
  {
    language: "spa",
    url: "https://cdn.jsdelivr.net/npm/@tesseract.js-data/spa@1.0.0/4.0.0_best_int/spa.traineddata.gz",
    sha256: "40be52f97b5d4eb7460073dc1f94cd546b27150333c0bf854ed7e7132db6bceb",
  },
];

const output = new URL("../public/models/tesseract/", import.meta.url);
await mkdir(output, { recursive: true });

for (const model of models) {
  const response = await fetch(model.url);
  if (!response.ok) {
    throw new Error(`Unable to download ${model.language}: ${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const checksum = createHash("sha256").update(bytes).digest("hex");
  if (checksum !== model.sha256) {
    throw new Error(
      `${model.language} checksum mismatch: expected ${model.sha256}, received ${checksum}`,
    );
  }
  await writeFile(new URL(`${model.language}.traineddata.gz`, output), bytes);
  console.log(`${model.language}: ${bytes.length} bytes ${checksum}`);
}
