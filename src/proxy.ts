import { NextResponse } from "next/server";
import { auth } from "@/auth";

const publicPaths = new Set([
  "/login",
  "/api/stripe/webhook",
]);

export const proxy = auth((request) => {
  const { pathname, search } = request.nextUrl;
  const isPublic =
    publicPaths.has(pathname) ||
    pathname.startsWith("/api/auth/");

  if (isPublic) {
    if (pathname === "/login" && request.auth?.user) {
      const destination = request.nextUrl.clone();
      destination.pathname = "/";
      destination.search = "";
      return NextResponse.redirect(destination);
    }
    return NextResponse.next();
  }

  if (request.auth?.user) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  const login = request.nextUrl.clone();
  login.pathname = "/login";
  login.search = "";
  login.searchParams.set("callbackUrl", `${pathname}${search}`);
  return NextResponse.redirect(login);
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:png|jpg|jpeg|gif|webp|svg)$).*)",
  ],
};
