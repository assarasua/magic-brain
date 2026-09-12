import { NextRequest, NextResponse } from "next/server";
import { CatalogFilters, getCatalog } from "@/lib/catalog";

export const runtime = "nodejs";

const positiveInteger = (value: string | null, fallback: number, maximum: number) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
};

const sorts = new Set<NonNullable<CatalogFilters["sort"]>>([
  "price_desc",
  "price_asc",
  "name_asc",
  "release_desc",
  "change_desc",
]);

const optionalNumber = (value: string | null) => {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
};

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const requestedSort = params.get("sort") as CatalogFilters["sort"];

  try {
    const result = await getCatalog({
      page: positiveInteger(params.get("page"), 1, 10_000),
      limit: positiveInteger(params.get("limit"), 48, 100),
      search: params.get("q")?.slice(0, 100) || undefined,
      rarity: params.get("rarity")?.slice(0, 30) || undefined,
      setCode: params.get("set")?.slice(0, 20) || undefined,
      color: params.get("color")?.slice(0, 1) || undefined,
      language: params.get("language")?.slice(0, 10) || undefined,
      type: params.get("type")?.slice(0, 50) || undefined,
      minPrice: optionalNumber(params.get("minPrice")),
      maxPrice: optionalNumber(params.get("maxPrice")),
      foilOnly: params.get("foil") === "true",
      reservedOnly: params.get("reserved") === "true",
      sort: requestedSort && sorts.has(requestedSort) ? requestedSort : "price_desc",
    });

    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, max-age=30" },
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to load the card catalogue" },
      { status: 500 },
    );
  }
}
