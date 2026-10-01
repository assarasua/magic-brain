import assert from "node:assert/strict";
import test from "node:test";
import { parseContactInput, parseNewsletterInput, renderWeeklyBriefEmail, weeklyNewsletterDeliveryDate, sendWeeklyBriefNewsletter } from "./resend.ts";

test("contact input validates and normalizes public fields", () => {
  assert.deepEqual(parseContactInput({ name: "  Asier  ", email: "USER@Example.com ", subject: "Hello", message: "A useful message here", website: "" }), {
    name: "Asier", email: "user@example.com", subject: "Hello", message: "A useful message here", website: "",
  });
  assert.equal(parseContactInput({ name: "A", email: "bad", message: "short" }), null);
});

test("newsletter input validates email and preserves honeypot submissions", () => {
  assert.deepEqual(parseNewsletterInput({ email: " USER@Example.com ", website: "" }), { email: "user@example.com", website: "" });
  assert.equal(parseNewsletterInput({ email: "not-an-email" }), null);
  assert.deepEqual(parseNewsletterInput({ email: "bot@example.com", website: "spam" }), { email: "bot@example.com", website: "spam" });
});

test("weekly newsletter renders market facts, links, and unsubscribe control", () => {
  const email = renderWeeklyBriefEmail({
    marketDataDate: "2026-09-17",
    content: {
      coverage: { currentCards: 1200 },
      breadth: { advancers: 700, decliners: 400, advancePercent: 58.3 },
      categories: {
        strongGrowth: [{ cardId: "card-one", name: "Card <One>", setCode: "abc", currentPrice: 12.5, change7d: 8.4 }],
        recoveryOpportunities: [],
        lostMomentum: [],
        majorRepricing: [],
      },
    },
  });
  assert.match(email.subject, /weekly market brief · data as of 2026-09-17/);
  assert.match(email.html, /cards observed on 2026-09-17/);
  assert.doesNotMatch(email.html, /today|DAILY MARKET/);
  assert.match(email.html, /Card &lt;One&gt;/);
  assert.match(email.html, /news\/2026-09-17/);
  assert.match(email.html, /market\?card=card-one/);
  assert.match(email.html, /RESEND_UNSUBSCRIBE_URL/);
});


test("weekly email follows Monday 08:00 in Madrid through both clock changes", () => {
  for (const [instant, expected] of [
    ["2026-10-05T05:59:59Z", null],
    ["2026-10-05T06:00:00Z", "2026-10-05"],
    ["2026-10-05T21:59:59Z", "2026-10-05"],
    ["2026-10-05T22:00:00Z", null],
    ["2026-10-26T06:59:59Z", null],
    ["2026-10-26T07:00:00Z", "2026-10-26"],
    ["2026-03-23T07:00:00Z", "2026-03-23"],
    ["2026-03-30T06:00:00Z", "2026-03-30"],
    ["2026-10-01T08:00:00Z", null],
    ["2026-10-04T08:00:00Z", null],
  ]) assert.equal(weeklyNewsletterDeliveryDate(new Date(instant)), expected, instant);
});

test("delivery skips other days and keys retries to the delivery week, not the price date", async (t) => {
  const saved = { apiKey: process.env.RESEND_API_KEY, audience: process.env.RESEND_AUDIENCE_ID };
  process.env.RESEND_API_KEY = "test-key";
  process.env.RESEND_AUDIENCE_ID = "test-audience";
  t.after(() => {
    for (const [key, value] of [["RESEND_API_KEY", saved.apiKey], ["RESEND_AUDIENCE_ID", saved.audience]]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url, key: options.headers["Idempotency-Key"] });
    return new Response(JSON.stringify({ id: "broadcast-one" }), { status: 200 });
  });
  const brief = {
    marketDataDate: "2026-09-17",
    content: {
      coverage: { currentCards: 1200 },
      breadth: { advancers: 700, decliners: 400, advancePercent: 58.3 },
      categories: { strongGrowth: [], recoveryOpportunities: [], lostMomentum: [], majorRepricing: [] },
    },
  };
  for (const instant of ["2026-10-01T08:00:00Z", "2026-10-05T05:59:00Z", "2026-10-06T06:00:00Z"]) {
    assert.deepEqual(await sendWeeklyBriefNewsletter(brief, new Date(instant)), { status: "scheduled_weekly" });
  }
  assert.equal(calls.length, 0);
  const sent = await sendWeeklyBriefNewsletter(brief, new Date("2026-10-05T06:00:00Z"));
  assert.deepEqual(sent, { status: "sent", broadcastId: "broadcast-one", marketDataDate: "2026-09-17", deliveryDate: "2026-10-05" });
  await sendWeeklyBriefNewsletter({ ...brief, marketDataDate: "2026-10-05" }, new Date("2026-10-05T08:00:00Z"));
  await sendWeeklyBriefNewsletter(brief, new Date("2026-10-12T06:00:00Z"));
  assert.deepEqual(calls.map(({ key }) => key), [
    "magic-brain-weekly-2026-10-05", "magic-brain-weekly-send-2026-10-05",
    "magic-brain-weekly-2026-10-05", "magic-brain-weekly-send-2026-10-05",
    "magic-brain-weekly-2026-10-12", "magic-brain-weekly-send-2026-10-12",
  ]);
  assert.equal(calls[0].url, "https://api.resend.com/broadcasts");
  assert.equal(calls[1].url, "https://api.resend.com/broadcasts/broadcast-one/send");
});
