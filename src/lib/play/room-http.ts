import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUser } from "@/lib/session";
import { RoomError, roomAssert } from "./rooms";
export async function roomRequest(
  request: NextRequest,
  work: (userId: string, body: unknown) => Promise<unknown>,
) {
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Robots-Tag": "noindex, nofollow",
  };
  try {
    if (request.method !== "GET") {
      const origin = request.headers.get("origin");
      roomAssert(origin === request.nextUrl.origin, "origin", 403);
      roomAssert(
        request.headers.get("content-type")?.split(";")[0] ===
          "application/json",
        "invalidAction",
        415,
      );
    }
    const session = await getOrCreateUser(request).catch(() => null);
    roomAssert(session?.user.authenticated, "signIn", 401);
    let body: unknown = null;
    if (request.method !== "GET") {
      const reader = request.body?.getReader();
      roomAssert(reader, "invalidAction");
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > 120000) {
          await reader.cancel();
          throw new RoomError("tooLarge", 413);
        }
        chunks.push(next.value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      const raw = new TextDecoder().decode(bytes);
      try {
        body = JSON.parse(raw);
      } catch {
        throw new RoomError("invalidAction");
      }
    }
    return NextResponse.json(await work(session.user.id, body), { headers });
  } catch (error) {
    if (error instanceof RoomError)
      return NextResponse.json(
        { error: error.code },
        { status: error.status, headers },
      );
    return NextResponse.json(
      { error: "unavailable" },
      { status: 503, headers },
    );
  }
}
