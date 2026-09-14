const categories = new Set([
  "system",
  "cards",
  "sets",
  "news",
  "predict",
  "graph",
  "profile",
  "portfolio",
  "ml",
]);
const outcomes = new Set(["success", "error", "cancelled"]);

export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > 1_024) {
    return new Response(null, { status: 413 });
  }
  const body = (await request.json().catch(() => null)) as {
    category?: unknown;
    outcome?: unknown;
    locale?: unknown;
  } | null;
  if (
    !body ||
    typeof body.category !== "string" ||
    !categories.has(body.category) ||
    typeof body.outcome !== "string" ||
    !outcomes.has(body.outcome) ||
    (body.locale !== "en" && body.locale !== "es")
  ) {
    return new Response(null, { status: 400 });
  }
  console.info("web_console_command", {
    category: body.category,
    outcome: body.outcome,
    locale: body.locale,
  });
  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}
