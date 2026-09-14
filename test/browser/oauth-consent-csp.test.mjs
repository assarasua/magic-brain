import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { createServer } from "node:http";
import test from "node:test";
import { chromium } from "playwright-core";
import {
  consentContentSecurityPolicy,
  renderOAuthConsentPage,
} from "../../src/lib/oauth-consent-page.ts";

test(
  "Chromium follows the consent POST redirect to the registered callback",
  { timeout: 15_000 },
  async () => {
    let callbackHit = false;
    const callbackServer = createServer((_request, response) => {
      callbackHit = true;
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end("<!doctype html><title>OAuth callback reached</title>");
    });
    const callbackOrigin = await listen(callbackServer);
    const callbackUrl = `${callbackOrigin}/oauth/callback?code=synthetic&state=synthetic`;

    let appOrigin = "";
    const appServer = createServer((request, response) => {
      if (request.method === "POST") {
        response.writeHead(303, { Location: callbackUrl });
        response.end();
        return;
      }
      const nonce = "synthetic-nonce";
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": consentContentSecurityPolicy(
          nonce,
          appOrigin,
          callbackUrl,
        ),
      });
      response.end(
        renderOAuthConsentPage({
          clientName: "Synthetic browser client",
          scopes: ["public:read"],
          requestToken: "synthetic-request",
          nonce,
        }),
      );
    });
    appOrigin = await listen(appServer);
    const authorizeUrl =
      `${appOrigin}/oauth/authorize?client_id=synthetic` +
      "&state=synthetic&code_challenge=synthetic";

    let browser;
    try {
      browser = await chromium.launch({
        executablePath: await chromiumExecutable(),
        headless: true,
        args: ["--no-sandbox"],
      });
      const page = await browser.newPage();
      const cspErrors = [];
      page.on("console", (message) => {
        if (message.type() === "error" && message.text().includes("form-action")) {
          cspErrors.push(message.text());
        }
      });
      await page.goto(authorizeUrl);
      await page.getByRole("button", { name: "Allow and continue" }).click();
      await page.waitForURL(callbackUrl, { timeout: 5_000 });
      assert.equal(callbackHit, true);
      assert.equal(cspErrors.length, 0);
    } finally {
      await browser?.close();
      await close(appServer);
      await close(callbackServer);
    }
  },
);

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return `http://127.0.0.1:${address.port}`;
}

async function close(server) {
  server.closeAllConnections?.();
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function chromiumExecutable() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next known CI or developer workstation path.
    }
  }
  throw new Error(
    "Chromium is required; set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH",
  );
}
