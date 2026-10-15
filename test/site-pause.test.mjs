import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { NextRequest } from "next/server.js";
import nextTesting from "next/experimental/testing/server.js";
const { unstable_doesMiddlewareMatch } = nextTesting;
import { proxy, config } from "../src/proxy.ts";
import { pausedRequestAction } from "../src/lib/site-mode.ts";
import sitemap from "../src/app/sitemap.ts";

const origin = "https://magicbrain.es";

test("only landing, legal documents and exact preview assets are public", () => {
  for (const path of ["/", "/privacy", "/privacy/", "/cookies", "/terms", "/robots.txt", "/sitemap.xml", "/previews/magic-brain.jpg"]) {
    assert.equal(pausedRequestAction(path, "GET"), "allow", path);
    assert.equal(pausedRequestAction(path, "HEAD"), "allow", path);
    assert.equal(pausedRequestAction(path, "POST"), "unavailable", path);
  }
});

test("existing and unknown product URLs redirect without preserving sensitive query strings", () => {
  for (const path of ["/login", "/portfolio", "/market", "/settings", "/mcp", "/developers", "/oauth/authorize", "/shared/portfolio/private-token", "/new-feature"]) {
    const response = proxy(new NextRequest(`${origin}${path}?code=private-value`));
    assert.equal(response.status, 307, path);
    assert.equal(response.headers.get("location"), `${origin}/`);
    assert.match(response.headers.get("cache-control"), /no-store/);
  }
});

test("all API methods and OAuth metadata stop before authentication or data access", async () => {
  for (const path of ["/api/account", "/api/auth/session", "/api/auth/callback/google", "/api/v1/cards", "/api/v1/openapi.json", "/api/jobs/news", "/api/stripe/webhook", "/api/contact", "/api/newsletter/extra", "/.well-known/oauth-authorization-server"]) {
    for (const method of ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
      assert.equal(unstable_doesMiddlewareMatch({ config, url: path }), true, path);
      const response = proxy(new NextRequest(`${origin}${path}`, { method }));
      assert.equal(response.status, 503, `${method} ${path}`);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal((await response.json()).error.code, "service_paused");
    }
  }
});

test("newsletter is the only enabled write endpoint and static runtime assets remain reachable", () => {
  assert.equal(pausedRequestAction("/api/newsletter", "POST"), "allow");
  assert.equal(pausedRequestAction("/api/newsletter", "GET"), "unavailable");
  assert.equal(pausedRequestAction("/api/newsletter.json", "POST"), "unavailable");
  for (const path of ["/_next/static/chunks/app.js", "/_next/image?url=%2Fpreviews%2Fmagic-brain.jpg&w=1080&q=75"]) {
    assert.equal(unstable_doesMiddlewareMatch({ config, url: path }), false);
  }
});

test("sitemap only advertises pages available during the pause", () => {
  assert.deepEqual(sitemap().map(({ url }) => url), [origin + "/", origin + "/privacy", origin + "/cookies", origin + "/terms"]);
});

test("pause removes providers and requires explicit newsletter consent", async () => {
  const layout = await readFile("src/app/layout.tsx", "utf8");
  assert.match(layout, /SITE_PAUSED \? <PausedShell>\{children\}<\/PausedShell> : <CardDetailProvider>/);
  assert.match(layout, /!SITE_PAUSED && <Script/);
  assert.match(layout, /syncAccount=\{!SITE_PAUSED\}/);
  const route = await readFile("src/app/api/newsletter/route.ts", "utf8");
  assert.match(route, /body.consent !== "yes"/);
  assert.ok(route.indexOf('body.consent !== "yes"') < route.indexOf("await subscribeToNewsletter"));
});
