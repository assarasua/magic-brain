import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = Promise.all([
  readFile(
    new URL("../src/app/console/console-client.tsx", import.meta.url),
    "utf8",
  ),
  readFile(
    new URL("../src/app/api/console/events/route.ts", import.meta.url),
    "utf8",
  ),
  readFile(
    new URL("../src/app/api/console/status/route.ts", import.meta.url),
    "utf8",
  ),
]);

test("web console exposes keyboard, cancellation, JSON, and copy controls", async () => {
  const [client] = await files;
  assert.match(client, /event\.key === "ArrowUp"/);
  assert.match(client, /event\.key === "ArrowDown"/);
  assert.match(client, /event\.key === "Tab"/);
  assert.match(client, /controllerRef\.current\?\.abort/);
  assert.match(client, /navigator\.clipboard\.writeText/);
  assert.match(client, /entry\.json/);
  assert.match(client, /role="status"/);
  assert.match(client, /aria-live="polite"/);
});

test("browser adapter keeps secrets and arbitrary capabilities out", async () => {
  const [client] = await files;
  assert.doesNotMatch(client, /localStorage|sessionStorage/);
  assert.doesNotMatch(client, /MAGIC_BRAIN_API_KEY|--api-key/);
  assert.doesNotMatch(client, /\beval\(|new Function|WebSocket|FileSystem/);
  assert.match(client, /credentials: "same-origin"/);
  assert.match(client, /plan\.auth === "personal"/);
  assert.match(client, /sessionStatus !== "authenticated"/);
  assert.match(client, /CONSOLE_MAX_OUTPUT_CHARS/);
  assert.match(client, /window\.setTimeout\(\(\) => timeout\.abort\(\), 12_000\)/);
});

test("telemetry records only allowlisted category and outcome", async () => {
  const [, events] = await files;
  assert.match(events, /categories = new Set/);
  assert.match(events, /outcomes = new Set/);
  assert.doesNotMatch(events, /body\.command|rawCommand|arguments|cardName|listName/);
});

test("MCP status proxy uses one fixed upstream and bounded response fields", async () => {
  const [, , status] = await files;
  assert.match(
    status,
    /https:\/\/magic-brain-mcp\.assarasua\.workers\.dev\/healthz/,
  );
  assert.match(status, /AbortSignal\.timeout\(5_000\)/);
  assert.doesNotMatch(status, /request\.(?:url|json|text|headers)/);
});
