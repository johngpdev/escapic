import { existsSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import {
  fixturePhoto,
  fixtureRounds,
  roomCode,
  type PhotoResponse,
  type Player,
  type Room,
} from "@escape/shared";
import { env, hasKey } from "./env.js";
import { generateJson } from "./gemini.js";
import { globalBoards, locationBoard, nichePlayers, personal, personalLocations, recordGame } from "./stats.js";
import { login, register, setLocation, userForToken } from "./users.js";
import { repairPhoto, repairRounds } from "./repair.js";
import { PHOTO_SCHEMA, PHOTO_SYSTEM, PHOTO_USER, ROUNDS_SCHEMA, ROUNDS_SYSTEM, ROUNDS_USER } from "./prompt.js";

const app = new Hono();
app.use("*", cors());

const startedAt = Date.now();
const MAX_PLAYERS = 8;
const ROOM_TTL_MS = 3 * 60 * 60 * 1000;

interface Stored {
  room: Room;
  touched: number;
}
const rooms = new Map<string, Stored>();

const uid = () => Math.random().toString(36).slice(2, 10);
const clean = (s: unknown, fallback: string) =>
  String(typeof s === "string" ? s : fallback).trim().slice(0, 12) || fallback;

function sweep() {
  const now = Date.now();
  for (const [code, r] of rooms) if (now - r.touched > ROOM_TTL_MS) rooms.delete(code);
}

function uniqueCode(seed: number): string {
  let code = roomCode(seed);
  let n = 0;
  while (rooms.has(code)) {
    n += 1;
    code = roomCode(seed + n * 7919);
    if (n > 50) break;
  }
  return code;
}

/* ------------------------------------------------------------------ */

app.get("/api/health", (c) =>
  c.json({
    ok: true,
    uptimeSec: Math.round((Date.now() - startedAt) / 1000),
    hasKey: hasKey(),
    models: env.models,
    rooms: rooms.size,
    schema: 2,
  }),
);

/** Coordinates are unreadable. Reverse-geocode to a city name, cached. */
const geoCache = new Map<string, string>();

app.get("/api/geo/reverse", async (c) => {
  const lat = Number(c.req.query("lat"));
  const lon = Number(c.req.query("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return c.json({ label: "" }, 400);

  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const hit = geoCache.get(key);
  if (hit) return c.json({ label: hit });

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&lat=${lat}&lon=${lon}`,
      {
        headers: { "user-agent": "EscaPic/1.0 (hackathon demo)" },
        signal: AbortSignal.timeout(6000),
      },
    );
    const body = (await res.json()) as {
      address?: Record<string, string>;
      name?: string;
    };
    const a = body.address ?? {};
    const label =
      a.city || a.town || a.village || a.suburb || a.county || a.state || a.country || body.name || "";
    if (label) geoCache.set(key, label);
    return c.json({ label });
  } catch (e) {
    console.warn(`[geo] reverse failed: ${e instanceof Error ? e.message : e}`);
    return c.json({ label: "" });
  }
});

const AuthBody = z.object({
  name: z.string().min(2).max(12),
  password: z.string().min(4).max(72),
  location: z.string().max(60).optional(),
});

const bearer = (c: { req: { header: (n: string) => string | undefined } }) =>
  (c.req.header("authorization") ?? "").replace(/^Bearer\s+/i, "");

app.post("/api/auth/register", async (c) => {
  const body = AuthBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "name 2-12 chars, password 4+ chars" }, 400);
  try {
    const out = register(body.data.name, body.data.password, body.data.location ?? "");
    console.log(`[auth] registered ${body.data.name}`);
    return c.json(out);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "could not register" }, 409);
  }
});

app.post("/api/auth/login", async (c) => {
  const body = AuthBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "bad request" }, 400);
  try {
    const out = login(body.data.name, body.data.password);
    console.log(`[auth] login ${body.data.name}`);
    return c.json(out);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "could not log in" }, 401);
  }
});

app.get("/api/auth/me", (c) => {
  const user = userForToken(bearer(c));
  return user ? c.json(user) : c.json({ error: "not signed in" }, 401);
});

app.post("/api/auth/location", async (c) => {
  const body = z
    .object({ location: z.string().max(60) })
    .safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "bad request" }, 400);
  const user = setLocation(bearer(c), body.data.location);
  return user ? c.json(user) : c.json({ error: "not signed in" }, 401);
});

app.get("/api/stats/global", (c) => c.json(globalBoards(10)));

app.get("/api/stats/locations", (c) => c.json(locationBoard(3)));

app.get("/api/stats/personal/:key", (c) => {
  const key = c.req.param("key");
  const s = personal(key);
  const loc = personalLocations(key);
  if (!s) return c.json({ key, name: "", games: 0, points: 0, firsts: 0, best: 0, rarest: loc.rarest });
  return c.json({ ...s, rarest: loc.rarest, visited: loc.visited });
});

app.get("/api/stats/niche", (c) => c.json(nichePlayers(3)));

app.post("/api/stats/record", async (c) => {
  const body = z
    .object({
      key: z.string().min(1).max(64),
      name: z.string().min(1).max(12),
      points: z.number().min(0).max(10000),
      first: z.boolean(),
      location: z.string().max(60).optional(),
    })
    .safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "bad request" }, 400);
  const saved = recordGame(body.data);
  console.log(`[stats] ${saved.name} +${body.data.points} (total ${saved.points}, firsts ${saved.firsts})`);
  return c.json(saved);
});

/** One tiny real call. Answers "is my key alive" without playing a round. */
app.get("/api/diag", async (c) => {
  if (!hasKey()) return c.json({ ok: false, error: "GEMINI_API_KEY is empty" });
  if (env.demoOnly) return c.json({ ok: false, error: "DEMO_ONLY=1" });
  const t0 = Date.now();
  try {
    const out = await generateJson({
      system: "Reply with a JSON object.",
      user: "Return {ok:true}.",
      schema: { type: "OBJECT", properties: { ok: { type: "BOOLEAN" } }, required: ["ok"] },
      maxTokens: 20,
      timeoutMs: 15000,
    });
    return c.json({ ok: true, model: out.model, ms: Date.now() - t0 });
  } catch (e) {
    return c.json({
      ok: false,
      model: env.models.join(","),
      error: e instanceof Error ? e.message : String(e),
      ms: Date.now() - t0,
    });
  }
});

app.get("/api/warmup", async (c) => {  if (!hasKey() || env.demoOnly) return c.json({ ok: true, warm: false });
  const t0 = Date.now();
  try {
    await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${env.models[0]}:generateContent?key=${env.geminiKey}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "reply with {}" }] }],
          generationConfig: { responseMimeType: "application/json", maxOutputTokens: 8 },
        }),
        signal: AbortSignal.timeout(8000),
      },
    );
  } catch {
    /* best effort */
  }
  return c.json({ ok: true, warm: true, ms: Date.now() - t0 });
});

/* ---------------- create a room ---------------- */

const CreateBody = z.object({
  name: z.string().min(1).max(12),
  seed: z.number().int().optional(),
  demo: z.boolean().optional(),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD", "EXTREME", "IMPOSSIBLE"]).default("MEDIUM"),
  rounds: z.number().int().min(5).max(10).default(5),
  limitMin: z.number().int().min(1).max(30).default(10),
  venue: z.enum(["HOME", "OUTDOORS"]).default("HOME"),
});

app.post("/api/room", async (c) => {
  sweep();
  const body = CreateBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "need a name" }, 400);

  const seed = body.data.seed ?? Math.floor(Math.random() * 1_000_000);
  const t0 = Date.now();
  let rounds = fixtureRounds;

  if (!body.data.demo && !env.demoOnly && hasKey()) {
    try {
      const out = await generateJson({
        system: ROUNDS_SYSTEM,
        user: ROUNDS_USER(seed, body.data.rounds, body.data.difficulty),
        schema: ROUNDS_SCHEMA,
        maxTokens: 1400,
        temperature: 1.0,
        timeoutMs: env.caseTimeoutMs,
      });
      rounds = repairRounds(out.text, body.data.rounds);
      while (rounds.length < body.data.rounds) {
        const src = fixtureRounds[rounds.length % fixtureRounds.length]!;
        rounds.push({ ...src, id: `r${rounds.length + 1}`, order: rounds.length + 1 });
      }
      console.log(`[room] riddles ${Date.now() - t0}ms ${out.model}`);
    } catch (e) {
      console.warn(`[room] falling back to fixture riddles: ${e instanceof Error ? e.message : e}`);
    }
  }

  const hostId = uid();
  const config = {
    difficulty: body.data.difficulty,
    rounds: body.data.rounds,
    limitMin: body.data.limitMin,
    venue: body.data.venue,
  };
  const host: Player = {
    id: hostId,
    name: clean(body.data.name, "Host"),
    ms: 0,
    penalty: 0,
    round: 0,
    done: false,
  };
  const room: Room = {
    code: uniqueCode(seed),
    seed,
    status: "lobby",
    hostId,
    config,
    rounds,
    players: [host],
    startedAt: null,
    createdAt: Date.now(),
  };
  rooms.set(room.code, { room, touched: Date.now() });
  console.log(`[room] ${room.code} created by ${host.name} (${rounds.length} riddles)`);
  return c.json({ playerId: hostId, room });
});

/* ---------------- join / read / start / progress ---------------- */

const JoinBody = z.object({ name: z.string().min(1).max(12) });

app.post("/api/room/:code/join", async (c) => {
  sweep();
  const code = c.req.param("code").toUpperCase();
  const entry = rooms.get(code);
  if (!entry) return c.json({ error: "no such room" }, 404);
  if (entry.room.status !== "lobby") return c.json({ error: "already started" }, 409);
  if (entry.room.players.length >= MAX_PLAYERS) return c.json({ error: "room is full" }, 409);

  const body = JoinBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "need a name" }, 400);

  const player: Player = {
    id: uid(),
    name: clean(body.data.name, "Agent"),
    ms: 0,
    penalty: 0,
    round: 0,
    done: false,
  };
  entry.room.players.push(player);
  entry.touched = Date.now();
  console.log(`[room] ${code} +${player.name} (${entry.room.players.length})`);
  return c.json({ playerId: player.id, room: entry.room });
});

app.get("/api/room/:code", (c) => {
  const entry = rooms.get(c.req.param("code").toUpperCase());
  if (!entry) return c.json({ error: "no such room" }, 404);
  return c.json(entry.room);
});

app.post("/api/room/:code/start", async (c) => {
  const code = c.req.param("code").toUpperCase();
  const entry = rooms.get(code);
  if (!entry) return c.json({ error: "no such room" }, 404);

  const body = z
    .object({
      playerId: z.string(),
      config: z
        .object({
          difficulty: z.enum(["EASY", "MEDIUM", "HARD", "EXTREME", "IMPOSSIBLE"]),
          rounds: z.number().int().min(5).max(10),
          limitMin: z.number().int().min(1).max(30),
          venue: z.enum(["HOME", "OUTDOORS"]),
        })
        .partial()
        .optional(),
    })
    .safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "bad request" }, 400);
  if (body.data.playerId !== entry.room.hostId) return c.json({ error: "not the host" }, 403);

  if (body.data.config) {
    entry.room.config = { ...entry.room.config, ...body.data.config };
    entry.room.rounds = entry.room.rounds.slice(0, entry.room.config.rounds);
  }

  // The host picks difficulty in the lobby, so riddles are authored here —
  // this is the only moment the difficulty is known for certain.
  if (hasKey() && !env.demoOnly) {
    try {
      const out = await generateJson({
        system: ROUNDS_SYSTEM,
        user: ROUNDS_USER(
          entry.room.seed,
          entry.room.config.rounds,
          entry.room.config.difficulty,
          entry.room.config.venue,
        ),
        schema: ROUNDS_SCHEMA,
        maxTokens: 1400,
        temperature: 1.0,
        timeoutMs: env.caseTimeoutMs,
      });
      const fresh = repairRounds(out.text, entry.room.config.rounds);
      while (fresh.length < entry.room.config.rounds) {
        const src = fixtureRounds[fresh.length % fixtureRounds.length]!;
        fresh.push({ ...src, id: "r" + (fresh.length + 1), order: fresh.length + 1 });
      }
      entry.room.rounds = fresh;
      console.log(`[room] ${code} riddles authored for ${entry.room.config.difficulty}`);
    } catch (e) {
      console.warn(`[room] difficulty riddles failed, keeping existing: ${e instanceof Error ? e.message : e}`);
    }
  }

  entry.room.status = "live";
  entry.room.startedAt = Date.now();
  entry.touched = Date.now();
  console.log(`[room] ${code} started with ${entry.room.players.length}`);
  return c.json(entry.room);
});

const ProgressBody = z.object({
  playerId: z.string(),
  penalty: z.number().int().min(0),
  round: z.number().int().min(0).max(10),
  ms: z.number().int().min(0),
  done: z.boolean(),
});

app.post("/api/room/:code/progress", async (c) => {
  const code = c.req.param("code").toUpperCase();
  const entry = rooms.get(code);
  if (!entry) return c.json({ error: "no such room" }, 404);

  const body = ProgressBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "bad request" }, 400);

  const p = entry.room.players.find((x) => x.id === body.data.playerId);
  if (!p) return c.json({ error: "not in this room" }, 404);

  p.penalty = body.data.penalty;
  p.round = body.data.round;
  p.ms = body.data.ms;
  p.done = body.data.done;
  entry.touched = Date.now();

  if (entry.room.players.every((x) => x.done)) entry.room.status = "done";
  return c.json(entry.room);
});

/* ---------------- judge a photo ---------------- */

const PhotoBody = z.object({
  imageB64: z.string().min(100).max(4_000_000),
  prompt: z.string().max(200),
  category: z.string().max(160),
  demo: z.boolean().optional(),
});

app.post("/api/photo", async (c) => {
  const body = PhotoBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) {
    // Log it: a rejected body looks identical to "the model never ran" otherwise.
    console.warn(`[photo] 400 invalid body: ${JSON.stringify(body.error.issues).slice(0, 200)}`);
    return c.json({ error: "bad request", detail: body.error.issues }, 400);
  }

  // A model outage must never punish the player: accept on failure.
  const accept = (reason: string): PhotoResponse => ({
    ...fixturePhoto(),
    reason,
  });

  if (env.demoOnly || !hasKey()) {
    return c.json({ ...fixturePhoto(), reason: "Offline mode: taken on trust." });
  }

  const t0 = Date.now();
  try {
    const out = await generateJson({
      system: PHOTO_SYSTEM,
      user: PHOTO_USER({ prompt: body.data.prompt, category: body.data.category }),
      schema: PHOTO_SCHEMA,
      imageB64: body.data.imageB64.replace(/^data:image\/\w+;base64,/, ""),
      maxTokens: 400,
      temperature: 0.4,
      timeoutMs: env.captureTimeoutMs,
    });
    const photo = repairPhoto(out.text);
    const value: PhotoResponse = {
      ...photo,
      meta: { latencyMs: Date.now() - t0, model: out.model, fallback: false },
    };
    console.log(
      `[photo] ${value.meta.latencyMs}ms matched=${value.matched} "${value.label}" bonus=${value.bonus ? "yes" : "no"}`,
    );
    return c.json(value);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // A judge outage must be visible to the player, never silently correct.
    console.warn(`[photo] JUDGE FAILED after ${Date.now() - t0}ms: ${msg}`);
    return c.json({
      matched: true,
      reason: "The judge didn't answer, so this photo wasn't checked.",
      label: "unverified",
      box: null,
      bonus: null,
      meta: { latencyMs: Date.now() - t0, model: "fallback", fallback: true },
    } satisfies PhotoResponse);
  }
});

/* ------------------------------------------------------------------ */

const dist = resolve(import.meta.dirname, "../../web/dist");
if (existsSync(dist)) {
  app.use("/*", serveStatic({ root: relative(process.cwd(), dist).replaceAll("\\", "/") }));
  app.get("*", (c) => c.html(readFileSync(join(dist, "index.html"), "utf8")));
} else {
  console.warn(`[server] no build at ${dist}`);
}

console.log(`[server] :${env.port} key=${hasKey() ? "yes" : "NO (demo)"} models=${env.models.join(",")}`);
serve({ fetch: app.fetch, port: env.port }, (i) => {
  console.log(`[server] listening http://localhost:${i.port}`);
});
