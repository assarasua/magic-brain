import assert from "node:assert/strict";
import test from "node:test";
import {
  CONSOLE_MAX_COMMAND_LENGTH,
  ConsoleCommandError,
  parseConsoleCommand,
} from "./console-command.ts";

test("parses quoted card searches into a bounded public request", () => {
  const plan = parseConsoleCommand(
    'cards search "Black Lotus" --set lea --limit 8',
  );
  assert.equal(plan.kind, "request");
  assert.equal(plan.auth, "public");
  assert.equal(plan.path, "/api/v1/cards");
  assert.deepEqual(plan.query, { q: "black lotus", set: "lea", limit: "8" });
});

test("maps personal reads only to fixed same-origin session routes", () => {
  const profile = parseConsoleCommand("profile");
  const portfolio = parseConsoleCommand(
    "portfolio forecast --list 00000000-0000-4000-8000-000000000000",
  );
  assert.equal(profile.kind, "request");
  assert.equal(profile.auth, "personal");
  assert.equal(profile.path, "/api/account");
  assert.equal(portfolio.kind, "request");
  assert.equal(portfolio.auth, "personal");
  assert.equal(portfolio.path, "/api/portfolio");
});

test("supports JSON view without changing the request target", () => {
  const plan = parseConsoleCommand("news latest --json");
  assert.equal(plan.kind, "request");
  assert.equal(plan.path, "/api/v1/news/latest");
  assert.equal(plan.json, true);
});

test("rejects arbitrary endpoints, secrets, unknown flags, and shell commands", () => {
  for (const command of [
    "cards search lotus --base-url https://evil.example",
    "cards search lotus --api-key secret",
    "curl https://example.com",
    "cat /etc/passwd",
    "env",
  ]) {
    assert.throws(
      () => parseConsoleCommand(command),
      ConsoleCommandError,
      command,
    );
  }
});

test("enforces strict bounds, UUIDs, numbers, and calendar dates", () => {
  assert.throws(() =>
    parseConsoleCommand("cards get not-a-uuid"),
  );
  assert.throws(() =>
    parseConsoleCommand("sets list --limit 999"),
  );
  assert.throws(() =>
    parseConsoleCommand(
      "cards history 00000000-0000-4000-8000-000000000000 --from 2026-02-31 --to 2026-03-02",
    ),
  );
  assert.throws(() =>
    parseConsoleCommand("x".repeat(CONSOLE_MAX_COMMAND_LENGTH + 1)),
  );
});

test("requires complete Predict scenario inputs", () => {
  assert.throws(() =>
    parseConsoleCommand("predict scenario --set fin --budget 20"),
  );
  const plan = parseConsoleCommand(
    "predict scenario --set fin --budget 250 --risk balanced --positions 6",
  );
  assert.equal(plan.kind, "request");
  assert.deepEqual(plan.body, {
    setCode: "fin",
    budget: 250,
    risk: "balanced",
    maxPositions: 6,
  });
});
