import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("bulk actions use an accessible in-app confirmation flow", async () => {
  const page = await readFile(
    new URL("src/app/portfolio/page.tsx", root),
    "utf8",
  );
  const dialog = await readFile(
    new URL("src/components/portfolio-action-dialog.tsx", root),
    "utf8",
  );
  assert.match(page, /<BulkActionDialog/);
  assert.match(page, /<ConfirmationDialog/);
  assert.match(dialog, /role="dialog"/);
  assert.match(dialog, /role="alertdialog"/);
  assert.match(dialog, /aria-modal="true"/);
  assert.match(dialog, /event\.key === "Escape"/);
  assert.match(dialog, /event\.key !== "Tab"/);
  assert.match(dialog, /returnFocusRef\.current\?\.focus/);
});

test("bulk UI communicates distinct actions and preserves retries", async () => {
  const page = await readFile(
    new URL("src/app/portfolio/page.tsx", root),
    "utf8",
  );
  const dialog = await readFile(
    new URL("src/components/portfolio-action-dialog.tsx", root),
    "utf8",
  );
  assert.match(`${page}\n${dialog}`, /Remove holdings/);
  assert.match(dialog, /Create copies/);
  assert.match(dialog, /Move holdings/);
  assert.match(page, /Your selection is preserved so you can retry/);
  assert.match(page, /requestId: bulkRequestId/);
  assert.match(page, /bulkSubmittingRef\.current/);
  assert.match(page, /disabled=\{bulkBusy/);
  assert.match(page, /skipped/);
});

test("mobile bulk controls are a viewport-safe bottom sheet", async () => {
  const css = await readFile(
    new URL("src/app/portfolio/portfolio.module.css", root),
    "utf8",
  );
  assert.match(css, /\.bulkBar \{[\s\S]*position: fixed/);
  assert.match(css, /\.actionBackdrop \{[\s\S]*align-items: end/);
  assert.match(css, /max-height: calc\(100dvh - 20px\)/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
});
