#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const source = {
  sourceUrl:
    "https://media.wizards.com/2026/downloads/MagicCompRules%2020260807.pdf",
  rulesPageUrl: "https://magic.wizards.com/en/rules",
  version: "2026-08-07",
  effectiveDate: "2026-08-07",
  sha256: "9e2268a0ed58f229c5b974a3ae7986c5f91a5a052c4af1a9e672906a427c044c",
  contentLength: 2_524_708,
  pageCount: 312,
};
const maximumBytes = 5 * 1024 * 1024;
const timeoutMs = 30_000;
const outputDirectory = resolve(
  process.argv[2] ??
    fileURLToPath(new URL("../../rules-data", import.meta.url)),
);
const pdfPath = resolve(outputDirectory, "MagicCompRules-20260807.pdf");
const temporaryPath = `${pdfPath}.${process.pid}.tmp`;
const metadataPath = resolve(outputDirectory, "source.json");

await mkdir(outputDirectory, { recursive: true });
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), timeoutMs);

try {
  const response = await fetch(source.sourceUrl, {
    redirect: "follow",
    signal: controller.signal,
    headers: {
      "user-agent":
        "MagicBrainRulesIndexer/0.1 (+https://github.com/assarasua/magic-brain)",
      accept: "application/pdf",
    },
  });
  if (!response.ok || !response.body) {
    throw new Error(`Rules PDF download failed with HTTP ${response.status}`);
  }
  const finalUrl = new URL(response.url);
  if (finalUrl.protocol !== "https:" || finalUrl.hostname !== "media.wizards.com") {
    throw new Error(`Refusing unexpected rules PDF redirect to ${finalUrl.origin}`);
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/pdf")) {
    throw new Error(`Expected application/pdf, received ${contentType || "unknown"}`);
  }

  const chunks = [];
  let byteLength = 0;
  for await (const chunk of response.body) {
    byteLength += chunk.byteLength;
    if (byteLength > maximumBytes) {
      throw new Error(`Rules PDF exceeds ${maximumBytes} byte safety limit`);
    }
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    throw new Error("Downloaded content does not have a PDF signature");
  }
  const checksum = createHash("sha256").update(bytes).digest("hex");
  if (checksum !== source.sha256 || byteLength !== source.contentLength) {
    throw new Error(
      `Pinned source mismatch: expected ${source.sha256}/${source.contentLength}, received ${checksum}/${byteLength}`,
    );
  }

  await writeFile(temporaryPath, bytes, { mode: 0o600 });
  await rename(temporaryPath, pdfPath);
  const metadata = {
    ...source,
    fetchedAt: new Date().toISOString(),
    contentLength: byteLength,
    ...(response.headers.get("etag")
      ? { etag: response.headers.get("etag") }
      : {}),
    ...(response.headers.get("last-modified")
      ? { lastModified: response.headers.get("last-modified") }
      : {}),
    extractor: "pypdf@6.0.0",
  };
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, {
    mode: 0o600,
  });
  console.log(`Verified ${source.version}: ${checksum} (${byteLength} bytes)`);
  console.log(`Wrote local-only source to ${pdfPath}`);
} finally {
  clearTimeout(timeout);
  await rm(temporaryPath, { force: true });
}
