const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ContactInput = {
  name: string;
  email: string;
  subject: string;
  message: string;
  website: string;
};

export type NewsletterInput = {
  email: string;
  website: string;
};

function clean(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function parseContactInput(value: unknown): ContactInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const input = {
    name: clean(body.name, 100),
    email: clean(body.email, 254).toLowerCase(),
    subject: clean(body.subject, 140),
    message: clean(body.message, 4000),
    website: clean(body.website, 200),
  };
  if (input.website) return input;
  if (input.name.length < 2 || !EMAIL_PATTERN.test(input.email) || input.message.length < 10) return null;
  return input;
}

export function parseNewsletterInput(value: unknown): NewsletterInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const input = {
    email: clean(body.email, 254).toLowerCase(),
    website: clean(body.website, 200),
  };
  if (input.website) return input;
  return EMAIL_PATTERN.test(input.email) ? input : null;
}

export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

function resendConfig() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured");
  return { apiKey, from: process.env.RESEND_FROM_EMAIL ?? "Magic Brain <hello@magicbrain.es>" };
}

async function resend(
  path: string,
  payload: object,
  idempotencyKey?: string,
  acceptedStatuses: number[] = [],
) {
  const { apiKey } = resendConfig();
  const response = await fetch(`https://api.resend.com${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify(payload),
  });
  const responseText = await response.text();
  if (!response.ok && !acceptedStatuses.includes(response.status)) {
    console.error("Resend request failed", response.status, responseText.slice(0, 300));
    throw new Error("Resend request failed");
  }
  return responseText ? JSON.parse(responseText) as { id?: string } : {};
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character] ?? character);
}

export async function sendContactMessage(input: ContactInput, requestId: string) {
  const { from } = resendConfig();
  const recipient = process.env.CONTACT_TO_EMAIL ?? "assarasua@gmail.com";
  await resend("/emails", {
    from,
    to: [recipient],
    reply_to: input.email,
    subject: `[Magic Brain] ${input.subject || "New contact message"}`,
    text: `Name: ${input.name}\nEmail: ${input.email}\n\n${input.message}`,
    html: `<h2>New Magic Brain contact</h2><p><strong>Name:</strong> ${escapeHtml(input.name)}</p><p><strong>Email:</strong> ${escapeHtml(input.email)}</p><p>${escapeHtml(input.message).replace(/\n/g, "<br>")}</p>`,
  }, requestId);
}

export async function subscribeToNewsletter(input: NewsletterInput) {
  const audienceId = process.env.RESEND_AUDIENCE_ID;
  if (!audienceId) throw new Error("RESEND_AUDIENCE_ID is not configured");
  await resend(
    `/audiences/${encodeURIComponent(audienceId)}/contacts`,
    { email: input.email, unsubscribed: false },
    undefined,
    [409],
  );
}

type DailyBrief = {
  marketDataDate: string;
  content: {
    coverage: { currentCards: number };
    breadth: { advancers: number; decliners: number; advancePercent: number | null };
    categories: {
      strongGrowth: DailyBriefCard[];
      recoveryOpportunities: DailyBriefCard[];
      lostMomentum: DailyBriefCard[];
      majorRepricing: DailyBriefCard[];
    };
  };
};

type DailyBriefCard = {
  cardId: string;
  name: string;
  setCode: string;
  currentPrice: number;
  change7d: number | null;
};

export function newsletterDeliveryConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_AUDIENCE_ID);
}

export function renderDailyBriefEmail(brief: DailyBrief) {
  const renderCards = (items: DailyBriefCard[]) => items.length
    ? items.map((item) => {
      const cardUrl = `https://magicbrain.es/market?card=${encodeURIComponent(item.cardId)}`;
      return `<tr><td style="padding:12px 0;border-bottom:1px solid #1b2a39"><a href="${cardUrl}" style="color:#eaf5ff;text-decoration:none;font-weight:700">${escapeHtml(item.name)}</a><br><span style="color:#8294a8;font-size:12px">${escapeHtml(item.setCode.toUpperCase())}</span></td><td style="padding:12px 0;border-bottom:1px solid #1b2a39;text-align:right;color:#eaf5ff">€${item.currentPrice.toFixed(2)}<br><span style="color:${(item.change7d ?? 0) >= 0 ? "#58d6aa" : "#ff8791"};font-size:12px">${item.change7d === null ? "—" : `${item.change7d > 0 ? "+" : ""}${item.change7d.toFixed(1)}% 7D`}</span></td></tr>`;
    }).join("")
    : `<tr><td style="padding:14px 0;color:#8294a8">No cards met this signal today.</td></tr>`;
  const section = (label: string, title: string, color: string, items: DailyBriefCard[]) => `<div style="margin:30px 0"><p style="margin:0;color:${color};font-size:11px;font-weight:800;letter-spacing:.12em">${label}</p><h2 style="margin:7px 0 10px;font-size:20px;color:#f2f8ff">${title}</h2><table role="presentation" style="width:100%;border-collapse:collapse">${renderCards(items)}</table></div>`;
  const newsUrl = `https://magicbrain.es/news/${brief.marketDataDate}`;
  return {
    subject: `Magic Brain daily market brief · ${brief.marketDataDate}`,
    html: `<div style="margin:0;background:#050b12;padding:36px 16px;font-family:Inter,Arial,sans-serif;color:#eaf5ff"><div style="max-width:620px;margin:auto"><div style="padding:28px;border:1px solid #1c3043;border-radius:18px;background:linear-gradient(145deg,#0d1927,#08111c)"><a href="https://magicbrain.es" style="color:#f2f8ff;text-decoration:none;font-size:20px;font-weight:800">MAGIC<span style="color:#55baff">BRAIN</span></a><p style="margin:24px 0 0;color:#9b8cff;font-size:11px;font-weight:800;letter-spacing:.14em">DAILY MARKET INTELLIGENCE · ${escapeHtml(brief.marketDataDate)}</p><h1 style="font-size:34px;line-height:1.05;margin:10px 0 14px;letter-spacing:-.04em">Know what moved<br><span style="color:#55baff">in Magic cards.</span></h1><p style="color:#9aabbd;line-height:1.65">${brief.content.coverage.currentCards.toLocaleString("en-US")} cards observed today. ${brief.content.breadth.advancers} advanced and ${brief.content.breadth.decliners} declined${brief.content.breadth.advancePercent === null ? "." : `, for ${brief.content.breadth.advancePercent.toFixed(1)}% positive breadth.`}</p></div>${section("STRONG GROWTH", "Momentum leaders", "#58d6aa", brief.content.categories.strongGrowth)}${section("RECOVERY", "Cards finding support", "#67baff", brief.content.categories.recoveryOpportunities)}${section("LOST MOMENTUM", "Signals to review", "#ff9a86", brief.content.categories.lostMomentum)}${section("MAJOR REPRICING", "The largest moves", "#b39aff", brief.content.categories.majorRepricing)}<div style="margin:34px 0;padding:26px;border-radius:14px;text-align:center;background:#0c1825"><h2 style="margin:0 0 8px">See the evidence behind every signal.</h2><p style="margin:0 0 20px;color:#8294a8">Open the full brief for methodology, comparisons, and complete market context.</p><a href="${newsUrl}" style="display:inline-block;padding:14px 20px;border-radius:9px;background:linear-gradient(110deg,#713cf0,#2f8bff);color:white;text-decoration:none;font-weight:700">Open today’s Magic Brain</a></div><p style="color:#607286;font-size:11px;line-height:1.7;text-align:center">Magic Brain is unofficial Magic: The Gathering market intelligence. Price-derived information only, not financial advice.<br><a href="https://magicbrain.es" style="color:#7bbdf0">magicbrain.es</a> · <a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color:#7bbdf0">Unsubscribe</a></p></div></div>`,
  };
}

export async function sendDailyBriefNewsletter(brief: DailyBrief) {
  const { from } = resendConfig();
  const audienceId = process.env.RESEND_AUDIENCE_ID;
  if (!audienceId) throw new Error("RESEND_AUDIENCE_ID is not configured");
  const email = renderDailyBriefEmail(brief);
  const created = await resend("/broadcasts", {
    audience_id: audienceId,
    from,
    subject: email.subject,
    html: email.html,
  }, `magic-brain-daily-${brief.marketDataDate}`);
  if (!created.id) throw new Error("Resend did not return a broadcast ID");
  await resend(
    `/broadcasts/${encodeURIComponent(created.id)}/send`,
    {},
    `magic-brain-daily-send-${brief.marketDataDate}`,
  );
  return created.id;
}
