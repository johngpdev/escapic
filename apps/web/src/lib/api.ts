import {
  fixturePhoto,
  fixtureRoom,
  type JoinResponse,
  type PhotoResponse,
  type Room,
} from "@escape/shared";
import type { Frame as CamFrame } from "./camera";

const T = 20000;

async function j<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(T),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `http ${res.status}`);
  return body as T;
}

/** Why a photo wasn't judged. Each one has a different fix. */
export type Failure = "demo" | "network" | "http" | "timeout" | null;

export interface PhotoResult {
  verdict: PhotoResponse;
  failure: Failure;
  detail: string;
}

const unverified = (reason: string): PhotoResponse => ({
  matched: true,
  reason,
  label: "unverified",
  box: null,
  bonus: null,
  meta: { latencyMs: 0, model: "unverified", fallback: true },
});

export async function createRoom(name: string, demo: boolean): Promise<JoinResponse> {
  try {
    return await j<JoinResponse>("/api/room", {
      method: "POST",
      body: JSON.stringify({ name, demo }),
    });
  } catch (e) {
    console.warn("[api] create failed, solo mode", e);
    const room = fixtureRoom(Date.now() % 100000, "solo", name);
    room.code = "SOLO";
    room.status = "live";
    room.startedAt = Date.now();
    return { playerId: "solo", room };
  }
}

export async function joinRoom(code: string, name: string): Promise<JoinResponse> {
  return j<JoinResponse>(`/api/room/${encodeURIComponent(code)}/join`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function getRoom(code: string): Promise<Room> {
  return j<Room>(`/api/room/${encodeURIComponent(code)}`);
}

export async function startRoom(code: string, playerId: string, config?: unknown): Promise<Room> {
  return j<Room>(`/api/room/${encodeURIComponent(code)}/start`, {
    method: "POST",
    body: JSON.stringify({ playerId, config }),
  });
}

export async function reportProgress(
  code: string,
  playerId: string,
  p: { penalty: number; round: number; ms: number; done: boolean },
): Promise<void> {
  if (code === "SOLO") return;
  try {
    await j<Room>(`/api/room/${encodeURIComponent(code)}/progress`, {
      method: "POST",
      body: JSON.stringify({ playerId, ...p }),
    });
  } catch {
    /* never block the player on the scoreboard */
  }
}

export async function postPhoto(
  frame: CamFrame,
  prompt: string,
  category: string,
  demo = false,
): Promise<PhotoResult> {
  if (demo) {
    return {
      verdict: {
        ...fixturePhoto(),
        bonus: { question: "Demo mode: not judged. What colour is it?", answers: ["black", "white", "green", "red", "blue", "grey", "gray", "brown"] },
      },
      failure: "demo",
      detail: "?demo=1 is in the URL",
    };
  }

  try {
    const res = await fetch("/api/photo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ imageB64: frame.b64, prompt, category }),
      signal: AbortSignal.timeout(T),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(`[api] photo HTTP ${res.status}`, text.slice(0, 200));
      return {
        verdict: unverified("The server refused the upload."),
        failure: "http",
        detail: `HTTP ${res.status} · ${text.slice(0, 120) || "no body"}`,
      };
    }
    return { verdict: (await res.json()) as PhotoResponse, failure: null, detail: "" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const timeout = /abort|timeout/i.test(msg);
    console.warn("[api] photo request failed", msg);
    return {
      verdict: unverified(timeout ? "The judge timed out." : "The app can't reach the server."),
      failure: timeout ? "timeout" : "network",
      detail: msg.slice(0, 140),
    };
  }
}

export async function diag(): Promise<{ ok: boolean; model?: string; ms?: number; error?: string }> {
  try {
    const res = await fetch("/api/diag", { signal: AbortSignal.timeout(20000) });
    return (await res.json()) as { ok: boolean; model?: string; ms?: number; error?: string };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function warmup(): void {
  void fetch("/api/warmup", { signal: AbortSignal.timeout(8000) }).catch(() => undefined);
}
