import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import test from "node:test";
import { chromium } from "playwright-core";

const root = new URL("../../", import.meta.url);

test(
  "scanner uses mocked camera and sends only OCR text for multilingual upload",
  { timeout: 120_000 },
  async () => {
    const port = await availablePort();
    const server = spawn(
      process.execPath,
      ["node_modules/next/dist/bin/next", "dev", "-p", String(port)],
      {
        cwd: root,
        env: {
          ...process.env,
          AUTH_SECRET: "synthetic-browser-test-secret-32-characters",
          NEXT_TELEMETRY_DISABLED: "1",
        },
      },
    );
    let browser;
    try {
      await waitForServer(`http://localhost:${port}`);
      browser = await chromium.launch({
        executablePath: await chromiumExecutable(),
        headless: true,
        args: ["--no-sandbox", "--use-fake-ui-for-media-stream"],
      });
      const page = await browser.newPage();
      await page.addInitScript(() => {
        window.__magicBrainTestRecognizeCard = async (source, language) => {
          window.__scannerUploadType = source.type;
          const bitmap = await createImageBitmap(source);
          window.__scannerImageSize = {
            width: bitmap.width,
            height: bitmap.height,
          };
          bitmap.close();
          if (window.__bulkMode) {
            (window.__bulkOcrImageSizes ??= []).push({
              width: window.__scannerImageSize.width,
              height: window.__scannerImageSize.height,
            });
            const call = (window.__bulkOcrCalls = (window.__bulkOcrCalls ?? 0) + 1);
            await new Promise((resolve) => setTimeout(resolve, 2_500));
            return {
              text: call === 1 ? "Dragón de fuego SET TST 123" : "Relámpago SET TST 124",
              language,
              setCode: "tst",
              collectorNumber: call === 1 ? "123" : "124",
              confidence: 94,
            };
          }
          return {
            text: "Dragón de fuego SET TST Collector 123/300",
            language,
            setCode: "tst",
            collectorNumber: "123",
            confidence: 92,
          };
        };
        const canvas = document.createElement("canvas");
        canvas.width = 640;
        canvas.height = 900;
        const context = canvas.getContext("2d");
        context.fillStyle = "white";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = "black";
        context.font = "42px sans-serif";
        context.fillText("Dragón de fuego", 40, 80);
        context.font = "26px sans-serif";
        context.fillText("SET: TST Collector #123/300", 40, 760);
        Object.defineProperty(navigator, "mediaDevices", {
          configurable: true,
          value: {
            getUserMedia: async (constraints) => {
              window.__scannerCameraRequested = true;
              window.__scannerConstraints ??= [];
              window.__scannerConstraints.push(constraints);
              await new Promise((resolve) => setTimeout(resolve, 75));
              if (typeof constraints.video === "object") {
                throw new DOMException("Rear camera unavailable", "OverconstrainedError");
              }
              const stream = canvas.captureStream(5);
              window.__scannerTrack = stream.getVideoTracks()[0];
              context.fillStyle = "#111";
              context.fillRect(0, 899, 1, 1);
              window.__scannerTrack.requestFrame?.();
              return stream;
            },
          },
        });
      });

      const portfolio = emptyPortfolio();
      const holdingPosts = [];
      const batchPosts = [];
      await page.route("**/api/auth/session*", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            user: { id: "synthetic-user", name: "Scanner Test" },
            expires: "2099-01-01T00:00:00.000Z",
            preferencesOnboardingCompleted: true,
          }),
        });
      });
      await page.route("**/api/account", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            preferencesOnboardingCompleted: true,
            productTourCompleted: true,
            preferences: {},
          }),
        });
      });
      await page.route("**/api/portfolio*", async (route) => {
        if (route.request().method() === "POST") {
          if (new URL(route.request().url()).pathname.endsWith("/batch")) {
            holdingPosts.push({ batch: route.request().postDataJSON(), idempotencyKey: route.request().headers()["idempotency-key"] });
            await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ count: 3, clientIds: [] }) });
            return;
          }
          holdingPosts.push(route.request().postDataJSON());
          await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(portfolio) });
        } else {
          await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(portfolio) });
        }
      });
      let identifyBody;
      await page.route("**/api/cards/identify", async (route) => {
        identifyBody = route.request().postDataJSON();
        const secondCard = identifyBody.collectorNumber === "124";
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            candidates: [{
              id: secondCard ? "00000000-0000-4000-8000-000000000124" : "00000000-0000-4000-8000-000000000123",
              name: secondCard ? "Relámpago" : "Dragón de fuego",
              setCode: "tst",
              setName: "Synthetic Set",
              collectorNumber: secondCard ? "124" : "123",
              rarity: "rare",
              typeLine: "Creature",
              imageUrl: null,
              cardmarketId: null,
              price: 2.5,
              foilPrice: null,
              change7d: null,
              priceDate: null,
              confidence: 0.99,
              reason: "exact_print",
            }],
          }),
        });
      });
      await page.route("**/api/cards/search?**", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            cards: [{
              id: "00000000-0000-4000-8000-000000000124",
              name: "Relámpago",
              setCode: "lea",
              setName: "Limited Edition Alpha",
              collectorNumber: "161",
              rarity: "common",
              typeLine: "Instant",
              imageUrl: null,
              cardmarketId: null,
              price: 3,
              foilPrice: null,
              change7d: null,
              priceDate: null,
            }],
          }),
        });
      });
      await page.route("**/api/portfolio/batch", async (route) => {
        batchPosts.push({
          batch: route.request().postDataJSON(),
          idempotencyKey: route.request().headers()["idempotency-key"],
        });
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ count: 3, clientIds: [] }),
        });
      });

      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`http://localhost:${port}/portfolio`);
      await page.waitForTimeout(1_000);
      const scanButton = page.locator("button").filter({ hasText: "Scan cards" });
      if (!await scanButton.count()) {
        throw new Error(`Scanner action missing at ${page.url()}: ${(await page.locator("body").innerText()).slice(0, 500)}`);
      }
      await scanButton.click();
      await page.getByLabel("Printed language").selectOption("es");
      await page.getByLabel("Destination list").selectOption("00000000-0000-4000-8000-000000000002");
      await page.getByRole("button", { name: "Use camera" }).click();
      await page.getByLabel("Camera preview").waitFor();
      assert.equal(await page.evaluate(() => window.__scannerCameraRequested), true);
      await page.waitForFunction(() => {
        const video = document.querySelector("video");
        return Boolean(video?.srcObject && !video.paused && video.videoWidth > 0 && video.videoHeight > 0);
      });
      assert.deepEqual(
        await page.evaluate(() => window.__scannerConstraints.map((value) => value.video)),
        [{ facingMode: { ideal: "environment" } }, true],
      );
      const videoAttributes = await page.getByLabel("Camera preview").evaluate((video) => ({
        autoplay: video.autoplay,
        muted: video.muted,
        playsInline: video.playsInline,
        width: video.videoWidth,
        height: video.videoHeight,
      }));
      assert.deepEqual(videoAttributes, {
        autoplay: true,
        muted: true,
        playsInline: true,
        width: 640,
        height: 900,
      });
      assert.equal(await page.getByRole("button", { name: "Capture" }).isEnabled(), true);
      const cameraBounds = await page.locator('[class*="cameraViewport"]').boundingBox();
      assert.ok(cameraBounds && Math.abs(cameraBounds.width / cameraBounds.height - 63 / 88) < 0.03);
      const captureBounds = await page.getByRole("button", { name: "Capture" }).boundingBox();
      assert.ok(captureBounds && captureBounds.y + captureBounds.height <= 844);
      await page.screenshot({ path: "/tmp/magic-brain-scanner-mobile-camera.png" });

      await page.getByRole("button", { name: "Close" }).click();
      assert.equal(await page.evaluate(() => window.__scannerTrack.readyState), "ended");
      await page.locator("button").filter({ hasText: "Scan cards" }).click();
      await page.getByLabel("Printed language").selectOption("es");
      await page.getByLabel("Destination list").selectOption("00000000-0000-4000-8000-000000000002");
      await page.getByRole("button", { name: "Use camera" }).click();
      await page.waitForFunction(() => {
        const video = document.querySelector("video");
        return Boolean(video?.srcObject && video.videoWidth > 0 && video.videoHeight > 0);
      });
      await page.getByRole("button", { name: "Capture" }).click();
      const capturedPreview = page.getByAltText("Captured card");
      await capturedPreview.waitFor();
      assert.equal(await capturedPreview.isVisible(), true);
      await page.getByRole("button", { name: "Retake" }).waitFor();
      await page.getByRole("button", { name: "Recognize" }).waitFor();
      assert.equal(await page.evaluate(() => window.__scannerTrack.readyState), "ended");
      await page.evaluate(() => {
        window.__firstCaptureTrack = window.__scannerTrack;
      });
      await page.getByRole("button", { name: "Retake" }).click();
      await page.waitForFunction(() => {
        const video = document.querySelector("video");
        return Boolean(video?.srcObject && video.videoWidth > 0 && video.videoHeight > 0);
      });
      assert.equal(await page.evaluate(() => window.__firstCaptureTrack.readyState), "ended");
      assert.equal(await page.evaluate(() => window.__scannerTrack.readyState), "live");
      await page.getByRole("button", { name: "Capture" }).click();
      await page.getByRole("button", { name: "Recognize" }).click();
      await page.getByRole("heading", { name: "Confirm the exact printing" }).waitFor();
      assert.deepEqual(await page.evaluate(() => window.__scannerImageSize), { width: 640, height: 900 });
      assert.equal(await page.evaluate(() => window.__scannerTrack.readyState), "ended");
      await page.getByRole("button", { name: "Confirm and add" }).click();
      await page.getByRole("button", { name: "Scan next card" }).click();

      await page.evaluate(() => {
        navigator.mediaDevices.getUserMedia = async () => {
          throw new DOMException("Denied", "NotAllowedError");
        };
      });
      await page.getByRole("button", { name: "Use camera" }).click();
      await page.getByRole("alert").filter({ hasText: "Camera access was denied" }).waitFor();
      const png = await page.evaluate(() => {
        const canvas = document.createElement("canvas");
        canvas.width = 700;
        canvas.height = 980;
        const context = canvas.getContext("2d");
        context.fillStyle = "white";
        context.fillRect(0, 0, 700, 980);
        context.fillStyle = "black";
        context.font = "bold 52px sans-serif";
        context.fillText("Dragón de fuego", 45, 100);
        context.font = "30px sans-serif";
        context.fillText("SET: TST", 45, 760);
        context.fillText("Collector #123/300", 45, 820);
        return canvas.toDataURL("image/png").split(",")[1];
      });
      await page.locator('input[type="file"]').setInputFiles({
        name: "synthetic-spanish-card.png",
        mimeType: "image/png",
        buffer: Buffer.from(png, "base64"),
      });
      await page.getByRole("heading", { name: "Confirm the exact printing" }).waitFor({ timeout: 10_000 }).catch(async () => {
        throw new Error(`Scanner did not reach confirmation: ${(await page.getByRole("dialog").innerText()).slice(0, 800)}`);
      });
      assert.equal(identifyBody.language, "es");
      assert.equal(await page.evaluate(() => window.__scannerUploadType), "image/png");
      assert.equal(typeof identifyBody.text, "string");
      assert.ok(identifyBody.text.length > 0);
      assert.deepEqual(Object.keys(identifyBody).sort().filter((key) => identifyBody[key] !== undefined), ["collectorNumber", "language", "setCode", "text"].filter((key) => identifyBody[key] !== undefined).sort());
      assert.doesNotMatch(JSON.stringify(identifyBody), /data:image|base64|synthetic-spanish-card/i);
      await page.getByLabel("Not correct? Search manually").fill("Relámpago");
      await page.getByRole("button", { name: /Relámpago/ }).click();
      const bounds = await page.getByRole("dialog").boundingBox();
      assert.ok(bounds && bounds.width <= 390 && bounds.height <= 844);
      await page.getByRole("button", { name: "Confirm and add" }).click();
      await page.getByRole("button", { name: "Scan next card" }).waitFor();
      assert.equal(holdingPosts.length, 2);
      assert.equal(holdingPosts[1].cardId, "00000000-0000-4000-8000-000000000124");
      assert.equal(holdingPosts[1].listId, "00000000-0000-4000-8000-000000000002");
      assert.equal("photo" in holdingPosts[1], false);

      await page.getByRole("button", { name: "Close" }).click();
      await page.evaluate(() => {
        window.__bulkMode = true;
        const canvas = document.createElement("canvas");
        canvas.width = 1280;
        canvas.height = 720;
        const context = canvas.getContext("2d");
        window.__bulkDraw = (mode, variant = 0) => {
          context.fillStyle = mode === "dark" ? "#050505" : "#444";
          context.fillRect(0, 0, canvas.width, canvas.height);
          if (mode === "none") return;
          if (mode === "person") {
            context.fillStyle = "#c78f70";
            context.beginPath();
            context.ellipse(640, 330, 175, 245, 0, 0, Math.PI * 2);
            context.fill();
            context.fillStyle = "#30251f";
            context.fillRect(550, 300, 40, 18);
            context.fillRect(690, 300, 40, 18);
            window.__bulkTrack?.requestFrame?.();
            return;
          }
          const offset = mode === "moving" ? (variant % 2 ? 28 : -28) : 0;
          const borderless = mode === "borderless";
          context.fillStyle = mode === "dark" ? "#181818" : mode === "second" ? "#d6e7ff" : borderless ? "#747a70" : "#eee4cc";
          context.fillRect(404 + offset, 28, 472, 664);
          if (!borderless) {
            context.lineWidth = 10;
            context.strokeStyle = mode === "dark" ? "#dddddd" : "#111";
            context.strokeRect(404 + offset, 28, 472, 664);
          }
          context.fillStyle = mode === "dark" ? "#777" : borderless ? "#3e443d" : "#181818";
          context.font = "bold 34px serif";
          context.fillText(mode === "second" ? "Relámpago" : borderless ? "Bosque antiguo" : "Dragón de fuego", 430 + offset, 82);
          for (let y = 125; y < 650; y += 34) context.fillRect(435 + offset, y, 390, borderless ? 2 : 3);
          window.__bulkTrack?.requestFrame?.();
        };
        window.__bulkDraw("dark");
        navigator.mediaDevices.enumerateDevices = async () => [
          { kind: "videoinput", deviceId: "rear", groupId: "synthetic", label: "Rear camera" },
          { kind: "videoinput", deviceId: "front", groupId: "synthetic", label: "Front camera" },
        ];
        navigator.mediaDevices.getUserMedia = async (constraints) => {
          const requestedId = constraints.video?.deviceId?.exact ?? "rear";
          const stream = canvas.captureStream(15);
          window.__bulkTrack = stream.getVideoTracks()[0];
          window.__bulkTrack.getSettings = () => ({
            deviceId: requestedId,
            facingMode: requestedId === "front" ? "user" : "environment",
            width: 1280,
            height: 720,
          });
          window.__bulkDraw("dark");
          clearInterval(window.__bulkTicker);
          window.__bulkTicker = setInterval(() => {
            context.fillRect(0, 0, 1, 1);
            window.__bulkTrack?.requestFrame?.();
          }, 80);
          return stream;
        };
      });
      await page.locator("button").filter({ hasText: "Scan cards" }).click();
      await page.getByLabel("Printed language").selectOption("es");
      await page.getByLabel("Destination list").selectOption("00000000-0000-4000-8000-000000000002");
      await page.getByRole("button", { name: "Bulk scan" }).click();
      await page.getByLabel("Bulk scan camera preview").waitFor();
      await page.locator('[data-guidance="too_dark"]').waitFor();
      const queueRegion = page.getByLabel("Scan queue");
      assert.equal(await queueRegion.locator("article").count(), 0);
      const assertPreviewFillsFrame = async () => {
        const layout = await page.getByLabel("Bulk scan camera preview").evaluate((video) => {
          const viewport = video.parentElement;
          const overlay = viewport.querySelector("canvas");
          const guide = viewport.querySelector('[class*="frame"]');
          const box = (element) => {
            const bounds = element.getBoundingClientRect();
            return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
          };
          const style = getComputedStyle(video);
          return {
            video: box(video),
            viewport: box(viewport),
            overlay: box(overlay),
            guide: box(guide),
            position: style.position,
            objectFit: style.objectFit,
          };
        });
        assert.equal(layout.position, "absolute");
        assert.equal(layout.objectFit, "cover");
        assert.ok(Math.abs(layout.video.width - layout.viewport.width) <= 2.1, JSON.stringify(layout));
        assert.ok(Math.abs(layout.video.height - layout.viewport.height) <= 2.1, JSON.stringify(layout));
        assert.ok(Math.abs(layout.overlay.width - layout.viewport.width) <= 2.1);
        assert.ok(Math.abs(layout.overlay.height - layout.viewport.height) <= 2.1);
        assert.ok(layout.guide.height > layout.guide.width);
        assert.ok(layout.guide.height > layout.viewport.height * 0.9);
      };
      await assertPreviewFillsFrame();
      await page.setViewportSize({ width: 1100, height: 820 });
      await assertPreviewFillsFrame();
      await page.screenshot({ path: "/tmp/magic-brain-bulk-scanner-desktop-landscape-fill.png" });
      await page.setViewportSize({ width: 390, height: 844 });
      await assertPreviewFillsFrame();

      await page.evaluate(() => window.__bulkDraw("none"));
      await page.waitForTimeout(1_200);
      assert.equal(await queueRegion.locator("article").count(), 0);
      await page.evaluate(() => window.__bulkDraw("person"));
      await page.waitForTimeout(1_500);
      assert.equal(await queueRegion.locator("article").count(), 0);

      for (let frame = 0; frame < 6; frame += 1) {
        await page.evaluate((value) => window.__bulkDraw("moving", value), frame);
        await page.waitForTimeout(180);
      }
      assert.equal(await queueRegion.locator("article").count(), 0);
      await page.evaluate(() => window.__bulkDraw("first"));
      await page.waitForFunction(() => document.querySelectorAll('[aria-label="Scan queue"] article').length === 1).catch(async () => {
        throw new Error(`First card was not queued: ${JSON.stringify(await page.evaluate(() => window.__bulkScanDebug))}`);
      });
      assert.equal(await page.evaluate(() => window.__bulkTrack.readyState), "live");
      assert.deepEqual((await page.evaluate(() => window.__bulkOcrImageSizes))[0], { width: 756, height: 1056 });
      await page.screenshot({ path: "/tmp/magic-brain-bulk-scanner-mobile-detected.png" });

      await page.evaluate(() => window.__bulkDraw("none"));
      await page.waitForTimeout(700);
      await page.evaluate(() => window.__bulkDraw("second"));
      await page.waitForFunction(() => document.querySelectorAll('[aria-label="Scan queue"] article').length === 2).catch(async () => {
        throw new Error(`Second card was not queued: ${JSON.stringify(await page.evaluate(() => window.__bulkScanDebug))}`);
      });
      assert.equal(await page.evaluate(() => window.__bulkTrack.readyState), "live");

      await page.evaluate(() => window.__bulkDraw("none"));
      await page.waitForTimeout(1_500);
      await page.evaluate(() => window.__bulkDraw("second"));
      await page.waitForFunction(() => document.querySelectorAll('[aria-label="Scan queue"] article').length === 3).catch(async () => {
        throw new Error(`Duplicate was not queued: ${JSON.stringify(await page.evaluate(() => window.__bulkScanDebug))}`);
      });
      await page.waitForFunction(() => {
        const items = document.querySelectorAll('[aria-label="Scan queue"] article');
        return items.length === 2 && [...items].some((item) => item.textContent?.includes("Duplicate copy aggregated"));
      }, { timeout: 15_000 });
      await page.screenshot({ path: "/tmp/magic-brain-bulk-scanner-mobile-live.png" });
      await queueRegion.scrollIntoViewIfNeeded();
      await page.screenshot({ path: "/tmp/magic-brain-bulk-scanner-mobile-queue.png" });
      await page.getByRole("button", { name: "Add 3 cards to collection" }).click();
      await page.getByText("Added 3 cards.").waitFor().catch(async () => {
        throw new Error(`Bulk add did not finish: ${(await page.getByRole("dialog").innerText()).slice(-1_000)} posts=${JSON.stringify(holdingPosts.slice(-2))}`);
      });
      const batchPost = batchPosts[0];
      assert.ok(batchPost);
      assert.equal(batchPost.batch.items.length, 2);
      assert.equal(batchPost.batch.items.reduce((sum, item) => sum + item.quantity, 0), 3);
      assert.match(batchPost.idempotencyKey, /^[0-9a-f-]{36}$/);
      await page.evaluate(() => window.__bulkDraw("none"));
      await page.waitForTimeout(700);
      await page.evaluate(() => window.__bulkDraw("borderless"));
      await page.waitForFunction(() => {
        const queueLength = document.querySelectorAll('[aria-label="Scan queue"] article').length;
        const status = document.querySelector('[data-guidance]')?.textContent ?? "";
        return queueLength > 0 || /Moderate edges|Bordes suaves|Align card|Alinea/.test(status);
      }).catch(async () => {
        throw new Error(`Borderless guidance missing: ${JSON.stringify(await page.evaluate(() => window.__bulkScanDebug))}`);
      });
    } finally {
      await browser?.close();
      server.kill("SIGTERM");
    }
  },
);

function emptyPortfolio() {
  return {
    lists: [
      { id: "00000000-0000-4000-8000-000000000001", name: "Collection", isDefault: true, holdingCount: 0 },
      { id: "00000000-0000-4000-8000-000000000002", name: "Trade binder", isDefault: false, holdingCount: 0 },
    ],
    selectedListId: "00000000-0000-4000-8000-000000000001",
    holdings: [],
    recentSales: [],
    summary: { invested: 0, value: 0, gain: 0, gainPercent: 0, unrealizedGain: 0, unrealizedGainPercent: null, valuedInvested: 0, unpricedInvested: 0, pricedHoldings: 0, unpricedHoldings: 0, zeroCostHoldings: 0, pricingCoveragePercent: 0, winners: 0, losers: 0, flat: 0, bestContributor: null, worstContributor: null, cardCount: 0, realizedProceeds: 0, realizedCostBasis: 0, realizedPnl: 0, saleCount: 0 },
    history: [],
    forecast: { asOfDate: "2026-09-14", dataDate: null, source: "unavailable", modelVersion: null, confidence: "low", coverage: { forecastableHoldings: 0, totalHoldings: 0, projectedValuePercent: 0, staleCarriedHoldings: 0, excludedHoldings: 0, mlValuePercent: 0 }, assumptions: { annualBaseRatePercent: 0, annualVolatilityPercent: 0, compoundingCapPercent: 200 }, points: [] },
    opportunities: { comparableHoldings: 0, coveragePercent: 0, classifications: { strong_growth: { count: 0, holdingsPercent: 0, marketValue: 0, exposurePercent: 0 }, recovery_opportunity: { count: 0, holdingsPercent: 0, marketValue: 0, exposurePercent: 0 }, lost_momentum: { count: 0, holdingsPercent: 0, marketValue: 0, exposurePercent: 0 } } },
  };
}

async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => server.listen(0, "127.0.0.1", (error) => error ? reject(error) : resolve()));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForServer(url) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Next.js development server did not start");
}

async function chromiumExecutable() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {}
  }
  throw new Error("Chromium is required");
}
