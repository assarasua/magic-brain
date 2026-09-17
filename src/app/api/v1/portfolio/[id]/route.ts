import { deletePortfolioItem, getPortfolio } from "@/lib/portfolio";
import { authorizeOAuthRequest } from "@/lib/oauth";

export async function DELETE(request: Request, context: RouteContext<"/api/v1/portfolio/[id]">) {
  const access = await authorizeOAuthRequest(request, ["portfolio:write"]);
  if (!access) return Response.json({ error: { code: "oauth_required" } }, { status: 401 });
  const itemId = Number((await context.params).id);
  if (!Number.isInteger(itemId) || itemId < 1) return Response.json({ error: { code: "invalid_request" } }, { status: 400 });
  await deletePortfolioItem(access.userId, itemId);
  return Response.json({ data: await getPortfolio(access.userId) });
}
