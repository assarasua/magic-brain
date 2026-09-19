import type { NextRequest } from "next/server";
import { roomRequest } from "@/lib/play/room-http";
import { createRoom } from "@/lib/play/room-store";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  return roomRequest(request, (userId, body) => createRoom(userId, body));
}
