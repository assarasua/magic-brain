import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { StringDecoder } from "node:string_decoder";
import { createGunzip } from "node:zlib";
import { setTimeout as delay } from "node:timers/promises";
import { MAX_CARDS, MAX_RULINGS } from "./transform.mjs";

const BULK_URL = "https://api.scryfall.com/bulk-data";
const MAX_METADATA_BYTES = 1_048_576;
const MAX_DOWNLOAD_BYTES = 128 * 1_048_576;
const MAX_EXPANDED_BYTES = 512 * 1_048_576;
const MAX_LINE_BYTES = 1_048_576;
const TIMEOUT_MS = 120_000;
const USER_AGENT = "MagicBrain/1.0 (card-rules import; https://github.com/assarasua/magic-brain)";

function officialUrl(value, { metadata = false } = {}) {
  let url;
  try { url = new URL(value); } catch { throw new Error("Bulk source must be an official Scryfall HTTPS URL"); }
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
      !(metadata ? ["api.scryfall.com", "data.scryfall.io"] : ["data.scryfall.io"]).includes(url.hostname)) {
    throw new Error("Bulk source must be an official Scryfall HTTPS URL");
  }
  return url.toString();
}

function timestamp(value, label) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${label} must be an ISO timestamp`);
  }
  return value;
}

export function validateSources(value) {
  if (!value || typeof value !== "object") throw new Error("Source metadata must contain oracle and rulings descriptors");
  const result = {};
  for (const name of ["oracle", "rulings"]) {
    const source = value[name] ?? (name === "oracle" ? value.oracle_cards : undefined);
    if (!source || source.provider !== "Scryfall" || !/^[a-f0-9]{64}$/.test(source.sha256 ?? "")) {
      throw new Error(`${name} source requires provider Scryfall and a lowercase SHA-256 checksum of the downloaded bytes`);
    }
    const format = source.format === "jsonl.gz" ? "jsonl-gzip" : source.format;
    if (format !== undefined && !["json", "jsonl", "jsonl-gzip"].includes(format)) {
      throw new Error(`${name} source format must be json, jsonl, or jsonl-gzip`);
    }
    result[name] = {
      provider: "Scryfall",
      url: officialUrl(source.url, { metadata: true }),
      updatedAt: timestamp(source.updatedAt, `${name}.updatedAt`),
      fetchedAt: timestamp(source.fetchedAt, `${name}.fetchedAt`),
      sha256: source.sha256,
      ...(format ? { format } : {}),
      checksumScope: "downloaded-bytes",
    };
  }
  return result;
}

function byteLimit(maximum, hash) {
  let total = 0;
  return new Transform({
    transform(chunk, _encoding, callback) {
      total += chunk.length;
      if (total > maximum) return callback(new Error(`Bulk data exceeds the ${maximum}-byte limit`));
      hash?.update(chunk);
      callback(null, chunk);
    },
  });
}

export async function hashFile(path, maximum = MAX_EXPANDED_BYTES) {
  const info = await stat(path);
  if (!info.isFile() || info.size > maximum) throw new Error("Bulk input must be a regular file within its size limit");
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), byteLimit(maximum), async (source) => {
    for await (const chunk of source) hash.update(chunk);
  }, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  return hash.digest("hex");
}

export async function readBulkRecords(path, { maximumRecords, format } = {}) {
  const info = await stat(path);
  if (!info.isFile()) throw new Error("Bulk input must be a regular file");
  const handle = await open(path, "r");
  const signature = Buffer.alloc(2);
  try { await handle.read(signature, 0, 2, 0); } finally { await handle.close(); }
  const gzipped = signature[0] === 0x1f && signature[1] === 0x8b;
  const actualFormat = format ?? (gzipped ? "jsonl-gzip" : path.endsWith(".jsonl") ? "jsonl" : "json");
  if (!Number.isInteger(maximumRecords) || maximumRecords < 1) throw new Error("A positive bulk record limit is required");
  if ((actualFormat === "jsonl-gzip") !== gzipped) throw new Error("Bulk file compression does not match its source metadata");
  if (info.size > (gzipped ? MAX_DOWNLOAD_BYTES : MAX_EXPANDED_BYTES)) throw new Error("Bulk input exceeds its file size limit");
  if (actualFormat === "json") {
    const data = JSON.parse(await readFile(path, { encoding: "utf8", signal: AbortSignal.timeout(TIMEOUT_MS) }));
    if (!Array.isArray(data) || data.length > maximumRecords) throw new Error("Bulk JSON must be an array within its record limit");
    return data;
  }
  if (!["jsonl", "jsonl-gzip"].includes(actualFormat)) throw new Error("Unsupported bulk file format");
  const records = [];
  const decoder = new StringDecoder("utf8");
  let pending = "";
  let parsingError;
  const fail = (message) => {
    parsingError = new Error(message);
    throw parsingError;
  };
  const addLine = (line) => {
    if (!line.trim()) return;
    if (Buffer.byteLength(line) > MAX_LINE_BYTES) fail("A bulk JSONL record exceeds the line size limit");
    if (records.length >= maximumRecords) fail("Bulk JSONL exceeds its record limit");
    try { records.push(JSON.parse(line)); } catch { fail(`Invalid JSON on bulk line ${records.length + 1}`); }
  };
  const stages = [createReadStream(path)];
  if (gzipped) stages.push(createGunzip());
  stages.push(byteLimit(MAX_EXPANDED_BYTES));
  stages.push(async (source) => {
    for await (const chunk of source) {
      pending += decoder.write(chunk);
      let newline;
      while ((newline = pending.indexOf("\n")) !== -1) {
        addLine(pending.slice(0, newline));
        pending = pending.slice(newline + 1);
      }
      if (Buffer.byteLength(pending) > MAX_LINE_BYTES) fail("A bulk JSONL record exceeds the line size limit");
    }
    addLine(pending + decoder.end());
  });
  try {
    await pipeline(...stages, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (error) {
    throw parsingError ?? error;
  }
  return records;
}

export async function loadLocalBulk({ oracleFile, rulingsFile, metadataFile }) {
  const metadataInfo = await stat(metadataFile);
  if (!metadataInfo.isFile() || metadataInfo.size > MAX_METADATA_BYTES) throw new Error("Source metadata file is too large or not a regular file");
  const sources = validateSources(JSON.parse(await readFile(metadataFile, "utf8")));
  const records = {};
  for (const [name, path, maximumRecords] of [["oracle", oracleFile, MAX_CARDS], ["rulings", rulingsFile, MAX_RULINGS]]) {
    if (await hashFile(path) !== sources[name].sha256) throw new Error(`${name} file checksum does not match its source metadata`);
    records[name] = await readBulkRecords(path, { maximumRecords, format: sources[name].format });
  }
  return { oracleRecords: records.oracle, rulingRecords: records.rulings, sources };
}

export function bulkDescriptor(metadata, type) {
  const candidates = metadata?.data?.filter((entry) => entry.type === type);
  if (!Array.isArray(candidates) || candidates.length !== 1) throw new Error(`Scryfall bulk metadata must contain one ${type} dataset`);
  const entry = candidates[0];
  const format = entry.jsonl_download_uri ? "jsonl-gzip" : "json";
  const url = officialUrl(entry.jsonl_download_uri ?? entry.download_uri);
  const expectedBytes = entry.jsonl_download_uri ? entry.compressed_size : entry.size;
  const maximumBytes = format === "jsonl-gzip" ? MAX_DOWNLOAD_BYTES : MAX_EXPANDED_BYTES;
  if (!Number.isSafeInteger(expectedBytes) || expectedBytes <= 0 || expectedBytes > maximumBytes) {
    throw new Error(`Scryfall ${type} download size is missing or exceeds its limit`);
  }
  return { url, format, expectedBytes, maximumBytes, updatedAt: timestamp(entry.updated_at, `${type}.updated_at`) };
}

export async function downloadBulk({ cacheDirectory, fetchImpl = fetch, onProgress = () => {} }) {
  await mkdir(cacheDirectory, { recursive: true });
  let previousRequestAt = 0;
  const request = async (url) => {
    const wait = 120 - (Date.now() - previousRequestAt);
    if (wait > 0) await delay(wait);
    previousRequestAt = Date.now();
    const response = await fetchImpl(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json, application/x-ndjson, application/gzip, application/octet-stream" },
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      throw new Error(`Scryfall download failed with HTTP ${response.status}`);
    }
    return response;
  };
  onProgress("Reading Scryfall bulk dataset metadata.");
  const metadataResponse = await request(BULK_URL);
  const chunks = [];
  await pipeline(Readable.fromWeb(metadataResponse.body), byteLimit(MAX_METADATA_BYTES), async (source) => {
    for await (const chunk of source) chunks.push(chunk);
  }, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  const metadata = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  const sources = {};
  const paths = {};
  for (const [name, type] of [["oracle", "oracle_cards"], ["rulings", "rulings"]]) {
    const descriptor = bulkDescriptor(metadata, type);
    onProgress(`Downloading the complete ${type} dataset.`);
    const target = join(cacheDirectory, `${name}-${basename(new URL(descriptor.url).pathname)}`);
    const temporary = `${target}.${randomUUID()}.part`;
    const hash = createHash("sha256");
    const response = await request(descriptor.url);
    const declaredLength = response.headers.get("content-length");
    if (declaredLength !== null && Number(declaredLength) !== descriptor.expectedBytes) {
      await response.body.cancel();
      throw new Error(`Scryfall ${type} Content-Length differs from the bulk metadata`);
    }
    try {
      await pipeline(Readable.fromWeb(response.body), byteLimit(descriptor.maximumBytes, hash), createWriteStream(temporary, { flags: "wx" }),
        { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if ((await stat(temporary)).size !== descriptor.expectedBytes) throw new Error(`Scryfall ${type} download size differs from the bulk metadata`);
      await rename(temporary, target);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
    paths[name] = target;
    sources[name] = {
      provider: "Scryfall", url: descriptor.url, updatedAt: descriptor.updatedAt,
      fetchedAt: new Date().toISOString(), sha256: hash.digest("hex"),
      format: descriptor.format, checksumScope: "downloaded-bytes",
    };
  }
  const metadataFile = join(cacheDirectory, "sources.json");
  await writeFile(metadataFile, `${JSON.stringify(sources, null, 2)}\n`);
  onProgress("Validating card text, faces, and rulings.");
  return {
    oracleRecords: await readBulkRecords(paths.oracle, { maximumRecords: MAX_CARDS, format: sources.oracle.format }),
    rulingRecords: await readBulkRecords(paths.rulings, { maximumRecords: MAX_RULINGS, format: sources.rulings.format }),
    sources,
    files: { oracleFile: paths.oracle, rulingsFile: paths.rulings, metadataFile },
  };
}
