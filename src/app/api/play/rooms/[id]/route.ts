import type { NextRequest } from "next/server";
import { roomRequest } from "@/lib/play/room-http";
import { getRoom, mutateRoom } from "@/lib/play/room-store";
import { roomAssert } from "@/lib/play/rooms";
export const runtime = "nodejs";
async function roomId(context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  roomAssert(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id,
    ),
    "roomMissing",
    404,
  );
  return id;
}
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return roomRequest(request, async (userId) =>
    getRoom(await roomId(context), userId),
  );
}
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return roomRequest(request, async (userId, body) =>
    mutateRoom(await roomId(context), userId, body),
  );
}
