"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RoomView } from "@/lib/play/rooms";
import type { DeckInput } from "@/lib/play/decks";
import type { Action } from "@/lib/play/engine";

async function requestRoom(
  url: string,
  body?: Record<string, unknown>,
): Promise<RoomView> {
  const response = await fetch(url, {
    method: body ? (url.endsWith("/rooms") ? "POST" : "PATCH") : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      typeof result.error === "string" ? result.error : "unavailable",
    );
  return result;
}
export function useOnlineRoom() {
  const [id, setId] = useState("");
  const [room, setRoom] = useState<RoomView | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(false);
  const current = useRef<RoomView | null>(null);
  const pending = useRef(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      const found = new URLSearchParams(window.location.search).get("room");
      if (found) {
        setId(found);
        setOnline(true);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  const accept = useCallback((next: RoomView) => {
    if (
      !current.current ||
      current.current.id !== next.id ||
      next.revision >= current.current.revision
    ) {
      current.current = next;
      setRoom(next);
    }
    setError("");
  }, []);
  useEffect(() => {
    if (!id) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const next = await requestRoom(
          `/api/play/rooms/${encodeURIComponent(id)}`,
        );
        if (stopped) return;
        accept(next);
        const game = next.game;
        if (
          game &&
          !next.manual &&
          game.winner === null &&
          next.seats[
            game.commanderChoices.length
              ? (game.cards.find((c) => c.id === game.commanderChoices[0].card)
                  ?.owner ?? game.priority)
              : game.priority
          ]?.computer &&
          !pending.current
        ) {
          pending.current = true;
          try {
            const advanced = await requestRoom(`/api/play/rooms/${id}`, {
              type: "tick",
              revision: next.revision,
            });
            if (!stopped) accept(advanced);
          } catch (e) {
            if (!stopped && e instanceof Error && e.message !== "staleRoom")
              setError(e.message);
          } finally {
            pending.current = false;
          }
        }
      } catch (e) {
        if (!stopped) setError(e instanceof Error ? e.message : "unavailable");
      } finally {
        if (!stopped) timer = setTimeout(poll, 2000);
      }
    }
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [id, accept]);
  const send = useCallback(
    async (body: Record<string, unknown>) => {
      const latest = current.current;
      if (!latest || pending.current) return;
      pending.current = true;
      setBusy(true);
      try {
        accept(
          await requestRoom(`/api/play/rooms/${latest.id}`, {
            ...body,
            revision: latest.revision,
          }),
        );
      } catch (e) {
        const code = e instanceof Error ? e.message : "unavailable";
        setError(code);
        if (code === "staleRoom")
          try {
            accept(await requestRoom(`/api/play/rooms/${latest.id}`));
          } catch {
            /* Keep the last confirmed state while reconnecting. */
          }
      } finally {
        pending.current = false;
        setBusy(false);
      }
    },
    [accept],
  );
  async function create(input: DeckInput, players: number) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      const next = await requestRoom("/api/play/rooms", { input, players });
      accept(next);
      setId(next.id);
      setOnline(true);
      window.history.replaceState(null, "", `/play?room=${next.id}`);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "unavailable");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  function exit() {
    setId("");
    setRoom(null);
    current.current = null;
    setOnline(false);
    setError("");
    window.history.replaceState(null, "", "/play");
  }
  return {
    id,
    room,
    error,
    busy,
    online,
    setOnline,
    create,
    send,
    exit,
    action: (action: Action) => send({ type: "action", action }),
  };
}
export type OnlineRoomController = ReturnType<typeof useOnlineRoom>;
