import { NextRequest, NextResponse } from "next/server";
import { parseMlFeedbackEvent } from "@/lib/ml-feedback-contract";
import {
  FeedbackIdempotencyConflictError,
  FeedbackReferenceError,
  persistMlFeedbackEvent,
} from "@/lib/ml-feedback";
import { attachSessionCookie, getOrCreateUser } from "@/lib/session";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 4_096;

export async function POST(request: NextRequest) {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (
    !Number.isFinite(declaredLength) ||
    declaredLength < 0 ||
    declaredLength > MAX_BODY_BYTES
  ) {
    return NextResponse.json({ error: "Request body is too large" }, { status: 413 });
  }

  let user: Awaited<ReturnType<typeof getOrCreateUser>>["user"];
  let newToken: string | null;
  try {
    ({ user, newToken } = await getOrCreateUser(request));
  } catch {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  let input: unknown;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "Request body is too large" }, { status: 413 });
    }
    input = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const event = parseMlFeedbackEvent(input);
  if (!event) {
    return NextResponse.json({ error: "Invalid feedback event" }, { status: 400 });
  }

  try {
    const result = await persistMlFeedbackEvent(user.id, event);
    return attachSessionCookie(
      NextResponse.json(
        { eventId: result.id, duplicate: !result.created },
        { status: result.created ? 201 : 200 },
      ),
      newToken,
    );
  } catch (error) {
    if (error instanceof FeedbackIdempotencyConflictError) {
      return NextResponse.json(
        { error: "Event ID was already used with different data" },
        { status: 409 },
      );
    }
    if (error instanceof FeedbackReferenceError) {
      return NextResponse.json(
        { error: "Unknown card or model score attribution" },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "Feedback is temporarily unavailable" },
      { status: 500 },
    );
  }
}
