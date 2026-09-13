import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { authorizePublicRequest, type PublicApiAccess } from "./access";
import { ApiError } from "./core";

type CacheProfile = "metadata" | "latest" | "history" | "none";

const cacheHeaders: Record<CacheProfile, string> = {
  metadata: "public, s-maxage=3600, stale-while-revalidate=86400",
  latest: "public, s-maxage=300, stale-while-revalidate=900",
  history: "public, s-maxage=3600, stale-while-revalidate=86400",
  none: "no-store",
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, X-API-Key",
  "Access-Control-Max-Age": "86400",
};

function requestId(request: Request) {
  const supplied = request.headers.get("x-request-id");
  return supplied && /^[A-Za-z0-9._:-]{1,100}$/.test(supplied)
    ? supplied
    : randomUUID();
}

function headers(
  id: string,
  cache: CacheProfile,
  access?: PublicApiAccess,
  cors = true,
) {
  const result: Record<string, string> = {
    "Cache-Control": cacheHeaders[cache],
    "X-Request-Id": id,
    ...(cors ? corsHeaders : {}),
  };
  if (access) {
    result["RateLimit-Limit"] = String(access.limit);
    result["RateLimit-Policy"] = `${access.limit};w=60`;
    if (access.remaining !== undefined) {
      result["RateLimit-Remaining"] = String(access.remaining);
    }
  }
  return result;
}

function errorResponse(
  request: Request,
  error: unknown,
  options: { cors?: boolean } = {},
) {
  const id = requestId(request);
  const apiError =
    error instanceof ApiError
      ? error
      : new ApiError(500, "internal_error", "An unexpected error occurred");
  const responseHeaders = headers(id, "none", undefined, options.cors ?? true);
  if (apiError.status === 429) {
    responseHeaders["Retry-After"] = String(
      apiError.details?.retryAfter ?? 60,
    );
  }
  return NextResponse.json(
    {
      error: {
        code: apiError.code,
        message: apiError.message,
        ...(apiError.details ? { details: apiError.details } : {}),
      },
      meta: { requestId: id },
    },
    { status: apiError.status, headers: responseHeaders },
  );
}

export async function publicApiHandler(
  request: Request,
  cache: CacheProfile,
  handler: (access: PublicApiAccess) => Promise<{
    data: unknown;
    pagination?: Record<string, unknown>;
  }>,
) {
  const id = requestId(request);
  try {
    const access = await authorizePublicRequest(request);
    const result = await handler(access);
    return NextResponse.json(
      {
        data: result.data,
        meta: {
          requestId: id,
          access: { type: access.kind, tier: access.tier },
          ...(result.pagination ? { pagination: result.pagination } : {}),
        },
      },
      { headers: headers(id, cache, access) },
    );
  } catch (error) {
    return errorResponse(request, error);
  }
}

export async function privateApiHandler(
  request: Request,
  handler: () => Promise<{ data: unknown; status?: number }>,
) {
  const id = requestId(request);
  try {
    const result = await handler();
    return NextResponse.json(
      { data: result.data, meta: { requestId: id } },
      {
        status: result.status ?? 200,
        headers: headers(id, "none", undefined, false),
      },
    );
  } catch (error) {
    return errorResponse(request, error, { cors: false });
  }
}

export async function publicDocumentHandler(
  request: Request,
  document: unknown,
) {
  const id = requestId(request);
  try {
    const access = await authorizePublicRequest(request);
    return NextResponse.json(document, {
      headers: headers(id, "metadata", access),
    });
  } catch (error) {
    return errorResponse(request, error);
  }
}

export function publicOptions(request: Request) {
  return new Response(null, {
    status: 204,
    headers: headers(requestId(request), "metadata"),
  });
}
