import { NextRequest, NextResponse } from "next/server";
import {
  generateBrainPortfolio,
  type BrainPreferences,
} from "@/lib/brain";
import { normalizeSetCodes } from "@/lib/card-filters";
import { attachSessionCookie, getOrCreateUser } from "@/lib/session";

export const runtime = "nodejs";

const riskProfiles = new Set<BrainPreferences["risk"]>([
  "preservation",
  "conservative",
  "balanced",
  "growth",
  "aggressive",
]);

export async function POST(request: NextRequest) {
  try {
    const { user, newToken } = await getOrCreateUser(request);
    const body = (await request.json()) as {
      setCode?: string;
      budget?: number;
      risk?: BrainPreferences["risk"];
      locale?: string;
    };
    const setCodes = normalizeSetCodes([body.setCode]);
    const budget = Number(body.budget);
    const risk = body.risk ?? user.preferences.risk;

    if (
      setCodes.length !== 1 ||
      !Number.isFinite(budget) ||
      budget < 25 ||
      budget > 1_000_000 ||
      !riskProfiles.has(risk)
    ) {
      return NextResponse.json(
        { error: "Invalid automatic portfolio profile" },
        { status: 400 },
      );
    }

    const strategy: BrainPreferences["strategy"] =
      risk === "preservation" || risk === "conservative"
        ? "stability"
        : risk === "growth" || risk === "aggressive"
          ? "momentum"
          : "diversified";
    const result = await generateBrainPortfolio(
      user.id,
      {
        ...user.preferences,
        budget,
        risk,
        strategy,
        releaseEra: "any",
        setCodes,
        reservedOnly: false,
        locale: body.locale === "es" ? "es" : "en",
      },
      { savePreferences: false },
    );

    return attachSessionCookie(NextResponse.json(result), newToken);
  } catch {
    return NextResponse.json(
      { error: "Unable to generate an automatic portfolio" },
      { status: 500 },
    );
  }
}
