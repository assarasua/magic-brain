import { NextRequest, NextResponse } from "next/server";
import {
  getDiscoveryCards,
  saveDiscoveryDecision,
  undoDiscoveryDecision,
} from "@/lib/discovery";
import { rankByVerifiedScores } from "@/lib/ml-experience";
import {
  getMlExperienceForCards,
  unavailableMlExperience,
} from "@/lib/ml-serving";
import { attachSessionCookie, getOrCreateUser } from "@/lib/session";
import { addWatchlistItemIfMissing } from "@/lib/watchlist";

export const runtime = "nodejs";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  try {
    const { user, newToken } = await getOrCreateUser(request);
    const cards = await getDiscoveryCards(user.id, user.preferences);
    const experience = await getMlExperienceForCards(
      user.id,
      cards.map((card) => card.id),
    ).catch(unavailableMlExperience);
    return attachSessionCookie(
      NextResponse.json({
        cards: rankByVerifiedScores(cards, experience).map((card) => ({
          ...card,
          ml: experience.scores[card.id] ?? null,
        })),
        ranking: experience.ranking,
      }),
      newToken,
    );
  } catch {
    return NextResponse.json(
      { error: "Unable to load personalised cards" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, newToken } = await getOrCreateUser(request);
    const body = (await request.json()) as {
      cardId?: string;
      decision?: string;
      removeFromWatchlist?: boolean;
    };

    if (
      !body.cardId ||
      !uuidPattern.test(body.cardId) ||
      (body.decision !== "liked" &&
        body.decision !== "passed" &&
        body.decision !== "undo")
    ) {
      return NextResponse.json({ error: "Invalid discovery decision" }, { status: 400 });
    }

    if (body.decision === "undo") {
      await undoDiscoveryDecision(
        user.id,
        body.cardId,
        body.removeFromWatchlist === true,
      );
      return attachSessionCookie(
        NextResponse.json({ saved: true, undone: true }),
        newToken,
      );
    }

    await saveDiscoveryDecision(user.id, body.cardId, body.decision);
    let addedToWatchlist = false;
    if (body.decision === "liked") {
      addedToWatchlist = await addWatchlistItemIfMissing(user.id, body.cardId);
    }

    return attachSessionCookie(
      NextResponse.json({ saved: true, addedToWatchlist }),
      newToken,
    );
  } catch {
    return NextResponse.json(
      { error: "Unable to save discovery decision" },
      { status: 500 },
    );
  }
}
