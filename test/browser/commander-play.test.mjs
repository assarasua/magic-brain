import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import test from "node:test";
import { chromium } from "playwright-core";
import { buildDeck } from "../../src/lib/play/decks.ts";
import { applyRoomChange } from "../../src/lib/play/room-actions.ts";
import { roomView } from "../../src/lib/play/rooms.ts";

// Exercise the real UI and room reducer with separate browser contexts. Fixtures
// deliberately keep authentication, room persistence and provider calls offline.
test(
  "Commander UI imports a list, shares a private room, protects hands and synchronizes human moves",
  { timeout: 120000 },
  async (t) => {
    const socket = createServer();
    await new Promise((r) => socket.listen(0, "127.0.0.1", r));
    const port = socket.address().port;
    await new Promise((r) => socket.close(r));
    const origin = `http://localhost:${port}`;
    const server = spawn(
      process.execPath,
      ["node_modules/next/dist/bin/next", "dev", "-p", String(port)],
      {
        cwd: new URL("../../", import.meta.url),
        env: {
          ...process.env,
          AUTH_SECRET: "synthetic-play-browser-secret-32-characters",
          AUTH_URL: origin,
          NEXT_PUBLIC_APP_URL: origin,
          DATABASE_URL: "",
          NEXT_TELEMETRY_DISABLED: "1",
        },
      },
    );
    let output = "";
    server.stdout.on("data", (c) => (output = (output + c).slice(-6000)));
    server.stderr.on("data", (c) => (output = (output + c).slice(-6000)));
    let browser;
    const unexpected = [];
    const pageErrors = [];
    let room;
    try {
      let up = false;
      for (let i = 0; i < 60; i++) {
        try {
          if ((await fetch(`${origin}/play`)).ok) {
            up = true;
            break;
          }
        } catch {}
        await new Promise((r) => setTimeout(r, 500));
      }
      assert.ok(up, output);
      const candidates = [
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/usr/bin/google-chrome",
        "/usr/bin/chromium",
      ].filter(Boolean);
      let executablePath;
      for (const p of candidates) {
        try {
          await access(p);
          executablePath = p;
          break;
        } catch {}
      }
      assert.ok(executablePath, "Chromium is required");
      browser = await chromium.launch({
        executablePath,
        headless: true,
        args: ["--no-sandbox"],
      });
      async function userPage(user) {
        const context = await browser.newContext();
        const page = await context.newPage();
        page.on("pageerror", (e) => pageErrors.push(e.message));
        await page.addInitScript(() => {
          localStorage.setItem("magic-brain-cookie-consent-v1", "necessary");
          localStorage.setItem("magic-brain-locale", "en");
        });
        await page.route("**/*", async (route) => {
          const request = route.request();
          const url = new URL(request.url());
          if (url.origin !== origin) {
            if (url.hostname === "magic-brain-mcp.assarasua.workers.dev") {
              const headers = {
                "Access-Control-Allow-Origin": origin,
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers":
                  "Content-Type, MCP-Protocol-Version",
              };
              if (request.method() === "OPTIONS")
                return route.fulfill({ status: 204, headers });
              const body = request.postDataJSON();
              return route.fulfill({
                status: 200,
                headers,
                contentType: "application/json",
                body: JSON.stringify({
                  jsonrpc: "2.0",
                  id: body.id,
                  result: { tools: [] },
                }),
              });
            }
            return route.abort();
          }
          const json = (data, status = 200) =>
            route.fulfill({
              status,
              contentType: "application/json",
              body: JSON.stringify(data),
            });
          if (url.pathname === "/api/auth/session") return json(null);
          if (url.pathname === "/api/play/rules")
            return json({
              data: {
                results: [
                  {
                    excerpt:
                      "A commander costs an additional {2} for each previous cast from the command zone.",
                    citation: {
                      ruleNumber: "903.8",
                      section: "Commander",
                      page: 251,
                      sourceUrl: "https://magic.wizards.com/en/rules",
                    },
                  },
                ],
                source: {
                  effectiveDate: "2026-08-07",
                  freshnessNotice: "Test rules snapshot",
                },
              },
            });
          if (url.pathname === "/api/account")
            return json({ error: "Authentication required" }, 401);
          if (
            url.pathname === "/api/play/rooms" &&
            request.method() === "POST"
          ) {
            const b = request.postDataJSON();
            const built = buildDeck(b.input);
            assert.deepEqual(built.issues, []);
            room = {
              id: "11111111-1111-4111-8111-111111111111",
              hostUserId: user,
              revision: 0,
              expiresAt: "2099-01-01T00:00:00Z",
              state: {
                seats: Array.from({ length: b.players }, (_, i) => ({
                  name: i === 0 ? b.input.name : `Player ${i + 1}`,
                  userId: i === 0 ? user : null,
                  computer: false,
                  input: i === 0 ? b.input : null,
                  deck: i === 0 ? built.deck : null,
                  manual: false,
                })),
                game: null,
                manual: false,
                aiError: null,
              },
            };
            return json(roomView(room, user));
          }
          if (url.pathname.startsWith("/api/play/rooms/")) {
            if (!room) return json({ error: "roomMissing" }, 404);
            if (request.method() === "GET") return json(roomView(room, user));
            try {
              const b = request.postDataJSON();
              const built = b.type === "deck" ? buildDeck(b.input) : null;
              room = applyRoomChange(
                room,
                user,
                b,
                b.input ?? null,
                built
                  ? {
                      deck: built.deck,
                      manual: !!(built.manual.length || built.warnings.length),
                    }
                  : null,
                42,
              );
              return json(roomView(room, user));
            } catch (e) {
              return json(
                { error: e.code ?? "invalidAction" },
                e.status ?? 400,
              );
            }
          }
          if (url.pathname === "/api/portfolio/lists")
            return json({
              lists: [
                {
                  id: "22222222-2222-4222-8222-222222222222",
                  name: "Rabbit deck",
                },
              ],
            });
          if (url.pathname === "/api/portfolio")
            return json({
              holdings: [
                { name: "Isamaru, Hound of Konda", quantity: 1 },
                { name: "Plains", quantity: 40 },
                { name: "Hare Apparent", quantity: 59 },
              ],
            });
          if (url.pathname.startsWith("/api/")) {
            unexpected.push(`${request.method()} ${url.pathname}`);
            return route.abort();
          }
          return route.continue();
        });
        return page;
      }
      const local = await userPage("local");
      await local.goto(`${origin}/play`);
      assert.equal(
        await local
          .getByLabel("Player control 1", { exact: true })
          .inputValue(),
        "human",
      );
      assert.equal(
        await local
          .getByLabel("Player control 2", { exact: true })
          .inputValue(),
        "computer",
      );
      await local
        .getByRole("button", { name: "Start game", exact: true })
        .click();
      await local
        .getByRole("button", { name: "Pause AI", exact: true })
        .click();
      const visualCard = await local
        .locator("[data-home-seat] [data-card-id]")
        .first()
        .boundingBox();
      assert.ok(
        visualCard.height > visualCard.width * 1.3,
        "Cards use portrait proportions",
      );
      await local
        .getByRole("button", { name: "Keep hand", exact: true })
        .click();
      await local.getByText("Player 2 · AI paused", { exact: true }).waitFor();
      assert.equal(
        await local
          .getByRole("button", { name: "Keep hand", exact: true })
          .count(),
        0,
      );
      await local
        .getByRole("region", { name: "Player 2 battlefield", exact: true })
        .getByRole("button", { name: "Hand 7", exact: true })
        .click();
      await local.getByText("Cards hidden", { exact: true }).waitFor();
      await local.getByText("Table controls", { exact: true }).click();
      await local
        .getByRole("button", { name: "Control all seats", exact: true })
        .click();
      await local
        .getByRole("heading", { name: "Player 2 · Opening hand", exact: true })
        .waitFor();
      await local.getByRole("button", { name: "Search", exact: true }).click();
      await local
        .getByText(
          "A commander costs an additional {2} for each previous cast from the command zone.",
          { exact: true },
        )
        .waitFor();
      await local.setViewportSize({ width: 390, height: 844 });
      assert.ok(
        await local.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      await local.close();
      const shared = await userPage("shared");
      await shared.goto(`${origin}/play`);
      await shared
        .getByRole("button", { name: "Pass & play", exact: true })
        .click();
      await shared.waitForFunction(
        () =>
          document.querySelector('[aria-label="Player control 2"]').value ===
          "human",
      );
      await shared
        .getByRole("button", { name: "Start game", exact: true })
        .click();
      await shared
        .getByRole("button", { name: "Keep hand", exact: true })
        .click();
      await shared
        .getByRole("heading", { name: "Player 2 · Opening hand", exact: true })
        .waitFor();
      assert.ok(
        await shared
          .locator("[data-home-seat]")
          .getByRole("heading", { name: "Player 2", exact: true })
          .isVisible(),
      );
      await shared.close();
      const host = await userPage("host");
      await host.goto(`${origin}/play`);
      await host
        .getByRole("heading", { name: "Your table. Your decisions." })
        .waitFor();
      await host
        .getByRole("button", { name: "Online multiplayer", exact: true })
        .click();
      await host.getByLabel("Player name 1", { exact: true }).fill("Host");
      await host
        .getByLabel("Deck list · quantity and English card name", {
          exact: true,
        })
        .fill(
          "1 Isamaru, Hound of Konda (CHK) 19\n40 Plains\n59 Hare Apparent",
        );
      await host
        .getByLabel("Saved deck name 1", { exact: true })
        .fill("My rabbit deck");
      await host
        .getByRole("button", { name: "Save deck", exact: true })
        .click();
      await host
        .getByRole("status")
        .filter({ hasText: "Deck saved on this device." })
        .waitFor();
      await host
        .getByRole("button", { name: "Load my Magic Brain lists", exact: true })
        .click();
      await host
        .getByLabel("Load deck", { exact: true })
        .selectOption("collection:22222222-2222-4222-8222-222222222222");
      await host
        .getByRole("button", { name: "Create online room", exact: true })
        .click();
      await host
        .getByRole("heading", { name: "A seat for every opponent." })
        .waitFor();
      assert.equal(room.state.seats.length, 4);
      await host.getByLabel("Add computer to seat 3").selectOption("advisors");
      await host
        .getByRole("heading", { name: "Computer 3", exact: true })
        .waitFor();
      await host.getByLabel("Add computer to seat 4").selectOption("rats");
      await host
        .getByRole("heading", { name: "Computer 4", exact: true })
        .waitFor();
      const guest = await userPage("guest");
      await guest.goto(`${origin}/play?room=${room.id}`);
      await guest.getByLabel("Your table name", { exact: true }).fill("Guest");
      await guest
        .getByRole("button", { name: "Join the table", exact: true })
        .click();
      await guest
        .getByRole("button", { name: "Save my deck to the room", exact: true })
        .waitFor();
      await guest
        .getByRole("button", { name: "Save my deck to the room", exact: true })
        .click();
      await host
        .getByRole("button", { name: "Start online game", exact: true })
        .waitFor();
      await host.waitForFunction(
        () =>
          !Array.from(document.querySelectorAll("button")).find((b) =>
            b.textContent.includes("Start online game"),
          )?.disabled,
      );
      await host
        .getByRole("button", { name: "Start online game", exact: true })
        .click();
      await host
        .getByRole("heading", { name: "Host · Opening hand", exact: true })
        .waitFor();
      await guest.getByText("Waiting for Host.", { exact: true }).waitFor();
      assert.equal(
        await guest
          .getByRole("button", { name: "Keep hand", exact: true })
          .count(),
        0,
      );
      assert.ok(
        roomView(room, "host")
          .game.cards.filter((c) => c.zone === "hand" && c.owner === 1)
          .every((c) => c.def === "hidden"),
      );
      assert.ok(
        roomView(room, "guest")
          .game.cards.filter((c) => c.zone === "library")
          .every((c) => c.def === "hidden"),
      );
      await host
        .getByRole("button", { name: "Keep hand", exact: true })
        .click();
      await guest
        .getByRole("button", { name: "Keep hand", exact: true })
        .waitFor();
      await guest
        .getByRole("button", { name: "Keep hand", exact: true })
        .click();
      await host
        .getByRole("button", { name: "Continue", exact: true })
        .waitFor();
      assert.ok(room.state.game.players[2].kept);
      assert.ok(room.state.game.players[3].kept);
      await host.getByRole("button", { name: "Continue", exact: true }).click();
      await host
        .getByRole("button", { name: "Pass priority", exact: true })
        .waitFor();
      await host
        .getByRole("button", { name: "Pass priority", exact: true })
        .click();
      await guest
        .getByRole("button", { name: "Pass priority", exact: true })
        .waitFor();
      await guest
        .getByRole("button", { name: "Pass priority", exact: true })
        .click();
      await host
        .getByRole("button", { name: "Pass priority", exact: true })
        .waitFor();
      assert.equal(room.state.game.step, "draw");
      await guest.reload();
      await guest
        .getByText("Online game · your hand is private", { exact: true })
        .waitFor();
      assert.equal(roomView(room, "guest").seat, 1);
      assert.equal(
        await guest
          .getByRole("button", { name: "Keep hand", exact: true })
          .count(),
        0,
      );
      await host.setViewportSize({ width: 390, height: 844 });
      assert.ok(
        await host.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
      );
      await host.getByRole("button", { name: "ES", exact: true }).click();
      await host
        .getByText("Partida online · tu mano es privada", { exact: true })
        .waitFor();
      assert.ok(
        await host.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
      );
      assert.deepEqual(pageErrors, []);
      assert.deepEqual(unexpected, []);
    } catch (e) {
      t.diagnostic(JSON.stringify({ output, pageErrors, unexpected }));
      throw e;
    } finally {
      await browser?.close();
      server.kill("SIGTERM");
    }
  },
);
