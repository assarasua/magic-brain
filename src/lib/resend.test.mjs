import assert from "node:assert/strict";
import test from "node:test";
import { parseContactInput, parseNewsletterInput, renderDailyBriefEmail } from "./resend.ts";

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

test("daily newsletter renders market facts, links, and unsubscribe control", () => {
  const email = renderDailyBriefEmail({
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
  assert.match(email.subject, /2026-09-17/);
  assert.match(email.html, /Card &lt;One&gt;/);
  assert.match(email.html, /news\/2026-09-17/);
  assert.match(email.html, /market\?card=card-one/);
  assert.match(email.html, /RESEND_UNSUBSCRIBE_URL/);
});
