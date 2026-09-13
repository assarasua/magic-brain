import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getMarketBrief } from "@/lib/market-news";
import {
  getMlExperienceForCards,
  unavailableMlExperience,
} from "@/lib/ml-serving";

export const runtime = "nodejs";

const marketDatePattern = /^\d{4}-\d{2}-\d{2}$/;

const isValidMarketDate = (value: string) => {
  if (!marketDatePattern.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) &&
    parsed.toISOString().slice(0, 10) === value;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ date: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  const { date } = await params;
  if (!isValidMarketDate(date)) {
    return NextResponse.json(
      { error: "Invalid market data date" },
      { status: 400 },
    );
  }

  try {
    const brief = await getMarketBrief(date);
    if (!brief) {
      return NextResponse.json(
        { error: "Market brief not found" },
        { status: 404 },
      );
    }
    const categories = brief.content.categories;
    const items = [
      ...categories.strongGrowth,
      ...categories.recoveryOpportunities,
      ...categories.lostMomentum,
      ...categories.majorRepricing,
    ];
    const experience = await getMlExperienceForCards(
      session.user.id,
      items.map((item) => item.cardId),
    ).catch(unavailableMlExperience);
    const annotate = <T extends { cardId: string }>(values: T[]) =>
      values.map((item) => ({
        ...item,
        ml: experience.scores[item.cardId] ?? null,
      }));
    return NextResponse.json({ brief: {
      ...brief,
      content: {
        ...brief.content,
        categories: {
          strongGrowth: annotate(categories.strongGrowth),
          recoveryOpportunities: annotate(categories.recoveryOpportunities),
          lostMomentum: annotate(categories.lostMomentum),
          majorRepricing: annotate(categories.majorRepricing),
        },
      },
      ranking: experience.ranking,
    } }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("Unable to load market brief", error);
    return NextResponse.json(
      { error: "Unable to load market brief" },
      { status: 500 },
    );
  }
}
