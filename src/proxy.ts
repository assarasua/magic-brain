import { NextRequest, NextResponse } from "next/server.js";
import { PAUSED_MESSAGE, SITE_PAUSED, pausedRequestAction } from "./lib/site-mode.ts";

export function proxy(request: NextRequest) {
  if (!SITE_PAUSED) return NextResponse.next();
  const action = pausedRequestAction(request.nextUrl.pathname, request.method);
  if (action === "allow") return NextResponse.next();
  if (action === "redirect") {
    const response = NextResponse.redirect(new URL("/", request.url), 307);
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    return response;
  }
  return NextResponse.json(
    { error: { code: "service_paused", message: PAUSED_MESSAGE } },
    { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "86400" } },
  );
}

export const config = {
  matcher: ["/((?!_next/static/|_next/image|_next/webpack-hmr).*)"],
};
