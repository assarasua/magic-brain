import { NextRequest } from "next/server";
import { authorizationServerMetadata } from "@/lib/oauth";

export const runtime = "nodejs";

export function GET(request: NextRequest) {
  return Response.json(authorizationServerMetadata(request.nextUrl.origin), {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=300",
    },
  });
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
    },
  });
}
