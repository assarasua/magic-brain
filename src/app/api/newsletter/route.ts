import { isSameOrigin, parseNewsletterInput, subscribeToNewsletter } from "@/lib/resend";
import { createHash } from "node:crypto";
import { query } from "@/lib/db";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Invalid origin" }, { status: 403 });
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > 2_000) return Response.json({ error: "Request too large" }, { status: 413 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  const input = parseNewsletterInput(body);
  if (!input) return Response.json({ error: "Enter a valid email" }, { status: 400 });
  if (input.website) return Response.json({ ok: true });

  try {
    await subscribeToNewsletter(input);
    await query(
      `insert into app_privacy_consents
        (email_hash, consent_type, policy_version, source)
       values ($1, 'newsletter', '2026-09-17', 'public_newsletter_form')`,
      [createHash("sha256").update(input.email).digest("hex")],
    );
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Subscription could not be completed" }, { status: 503 });
  }
}
