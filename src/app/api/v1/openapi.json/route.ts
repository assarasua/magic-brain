import type { NextRequest } from "next/server";
import {
  publicDocumentHandler,
  publicOptions,
} from "@/lib/public-api/http";
import { publicApiOpenApi } from "@/lib/public-api/openapi";

export const runtime = "nodejs";

export function GET(request: NextRequest) {
  return publicDocumentHandler(request, publicApiOpenApi);
}

export const OPTIONS = publicOptions;
