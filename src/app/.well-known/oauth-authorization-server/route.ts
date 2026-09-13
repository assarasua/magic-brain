import { authorizationServerMetadata } from "@/lib/oauth";

export const runtime = "nodejs";

export function GET() {
  return Response.json(authorizationServerMetadata(), {
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
