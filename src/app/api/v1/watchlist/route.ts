import { addWatchlistItem, deleteWatchlistItem, getWatchlist } from "@/lib/watchlist";
import { authorizeOAuthRequest } from "@/lib/oauth";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const unauthorized = () => Response.json({ error: { code: "oauth_required", message: "OAuth authorization is required" } }, { status: 401 });

export async function GET(request: Request) {
  const access = await authorizeOAuthRequest(request, ["watchlist:read"]);
  return access ? Response.json({ data: await getWatchlist(access.userId) }) : unauthorized();
}

export async function POST(request: Request) {
  const access = await authorizeOAuthRequest(request, ["watchlist:write"]);
  if (!access) return unauthorized();
  const body = await request.json() as Record<string, unknown>;
  if (typeof body.cardId !== "string" || !uuid.test(body.cardId)) {
    return Response.json({ error: { code: "invalid_request", message: "Invalid card ID" } }, { status: 400 });
  }
  await addWatchlistItem(access.userId, body.cardId);
  return Response.json({ data: await getWatchlist(access.userId) }, { status: 201 });
}

export async function DELETE(request: Request) {
  const access = await authorizeOAuthRequest(request, ["watchlist:write"]);
  if (!access) return unauthorized();
  const cardId = new URL(request.url).searchParams.get("cardId") ?? "";
  if (!uuid.test(cardId)) return Response.json({ error: { code: "invalid_request" } }, { status: 400 });
  await deleteWatchlistItem(access.userId, cardId);
  return Response.json({ data: await getWatchlist(access.userId) });
}
