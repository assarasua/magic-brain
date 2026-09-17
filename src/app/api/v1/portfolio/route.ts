import { addPortfolioItem, getPortfolio } from "@/lib/portfolio";
import { isCardLanguage } from "@/lib/card-languages";
import { authorizeOAuthRequest } from "@/lib/oauth";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const unauthorized = () => Response.json({ error: { code: "oauth_required", message: "OAuth authorization is required" } }, { status: 401 });

export async function GET(request: Request) {
  const access = await authorizeOAuthRequest(request, ["portfolio:read"]);
  return access ? Response.json({ data: await getPortfolio(access.userId) }) : unauthorized();
}

export async function POST(request: Request) {
  const access = await authorizeOAuthRequest(request, ["portfolio:write"]);
  if (!access) return unauthorized();
  const body = await request.json() as Record<string, unknown>;
  if (
    typeof body.cardId !== "string" || !uuid.test(body.cardId) ||
    !Number.isInteger(body.quantity) || Number(body.quantity) < 1 || Number(body.quantity) > 10_000 ||
    typeof body.purchasePrice !== "number" || !Number.isFinite(body.purchasePrice) || body.purchasePrice < 0 ||
    (body.language !== undefined && !isCardLanguage(body.language))
  ) return Response.json({ error: { code: "invalid_request", message: "Invalid portfolio item" } }, { status: 400 });
  await addPortfolioItem(access.userId, {
    cardId: body.cardId,
    quantity: Number(body.quantity),
    purchasePrice: body.purchasePrice,
    condition: typeof body.condition === "string" ? body.condition.slice(0, 30) : "near_mint",
    language: isCardLanguage(body.language) ? body.language : "en",
    ...(typeof body.acquiredAt === "string" ? { acquiredAt: body.acquiredAt } : {}),
  });
  return Response.json({ data: await getPortfolio(access.userId) }, { status: 201 });
}
