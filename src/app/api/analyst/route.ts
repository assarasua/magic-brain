import { NextRequest, NextResponse } from "next/server";
import { answerPriceQuestion } from "@/lib/price-analyst";
import { attachSessionCookie, getOrCreateUser, isPro } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const { user, newToken } = await getOrCreateUser(request);
    if (!isPro(user)) {
      return attachSessionCookie(
        NextResponse.json(
          { error: "Brain Market Analyst requires Brain Pro" },
          { status: 403 },
        ),
        newToken,
      );
    }

    const body = (await request.json()) as {
      question?: string;
      locale?: string;
    };
    const question = body.question?.trim() ?? "";
    if (question.length < 3 || question.length > 300) {
      return NextResponse.json(
        { error: "Question must contain between 3 and 300 characters" },
        { status: 400 },
      );
    }

    return attachSessionCookie(
      NextResponse.json(
        await answerPriceQuestion(question, body.locale === "es" ? "es" : "en"),
      ),
      newToken,
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to analyse this question",
      },
      { status: 422 },
    );
  }
}
