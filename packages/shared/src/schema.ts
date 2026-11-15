import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Geometry (unchanged — frozen photos still need projection)          */
/* ------------------------------------------------------------------ */

export const BoxSchema = z.object({
  ymin: z.number(),
  xmin: z.number(),
  ymax: z.number(),
  xmax: z.number(),
});
export type Box = z.infer<typeof BoxSchema>;

export const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

export function normalizeBox(raw: { ymin: number; xmin: number; ymax: number; xmax: number }): Box {
  const ymin = Math.min(raw.ymin, raw.ymax);
  const ymax = Math.max(raw.ymin, raw.ymax);
  const xmin = Math.min(raw.xmin, raw.xmax);
  const xmax = Math.max(raw.xmin, raw.xmax);
  const c = { ymin: clamp01(ymin), xmin: clamp01(xmin), ymax: clamp01(ymax), xmax: clamp01(xmax) };
  return {
    ymin: c.ymin,
    xmin: c.xmin,
    ymax: Math.max(c.ymax, c.ymin + 0.02),
    xmax: Math.max(c.xmax, c.xmin + 0.02),
  };
}

/** Gemini's native grounding format: [ymin, xmin, ymax, xmax] on 0..1000. */
export function fromBox2d(v: readonly [number, number, number, number]): Box {
  return normalizeBox({
    ymin: v[0] / 1000,
    xmin: v[1] / 1000,
    ymax: v[2] / 1000,
    xmax: v[3] / 1000,
  });
}

/* ------------------------------------------------------------------ */
/* Rounds                                                              */
/* ------------------------------------------------------------------ */

export const RoundSchema = z.object({
  id: z.string().min(1),
  order: z.number().int().min(1),
  /** The riddle the player reads. Same for everyone in the room. */
  prompt: z.string().min(1).max(180),
  /** What the verifier checks the photo against. */
  category: z.string().min(1).max(140),
  /** Where to look, if you're stuck. */
  seekHint: z.string().min(1).max(180),
  /** The literal answer, shown when the round is cleared. */
  answer: z.string().min(1).max(40),
});
export type Round = z.infer<typeof RoundSchema>;

/* ------------------------------------------------------------------ */
/* Rooms                                                               */
/* ------------------------------------------------------------------ */

export const PlayerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(12),
  /** Elapsed time in ms. */
  ms: z.number().int().min(0),
  /** Time added by mistakes, in ms. */
  penalty: z.number().int().min(0),
  round: z.number().int().min(0),
  done: z.boolean(),
});
export type Player = z.infer<typeof PlayerSchema>;

export const RoomConfigSchema = z.object({
  difficulty: z.enum(["EASY", "MEDIUM", "HARD", "EXTREME", "IMPOSSIBLE"]).default("MEDIUM"),
  rounds: z.number().int().min(5).max(10).default(5),
  limitMin: z.number().int().min(1).max(30).default(10),
  venue: z.enum(["HOME", "OUTDOORS"]).default("HOME"),
});
export type RoomConfig = z.infer<typeof RoomConfigSchema>;

export const RoomSchema = z.object({
  code: z.string().length(4),
  seed: z.number().int(),
  status: z.enum(["lobby", "live", "done"]),
  hostId: z.string(),
  config: RoomConfigSchema,
  rounds: z.array(RoundSchema).min(5).max(10),
  players: z.array(PlayerSchema),
  startedAt: z.number().nullable(),
  createdAt: z.number(),
});
export type Room = z.infer<typeof RoomSchema>;

export const JoinResponseSchema = z.object({
  playerId: z.string(),
  room: RoomSchema,
});
export type JoinResponse = z.infer<typeof JoinResponseSchema>;

/* ------------------------------------------------------------------ */
/* Photo verification                                                  */
/* ------------------------------------------------------------------ */

export const PhotoResponseSchema = z.object({
  matched: z.boolean(),
  /** What the model actually saw. Shown to the player either way. */
  reason: z.string().max(240),
  label: z.string().max(48),
  box: BoxSchema.nullable(),
  /** One question about this specific object, answerable from the photo. */
  bonus: z
    .object({
      question: z.string().max(180),
      answers: z.array(z.string().min(1)).min(1).max(4),
    })
    .nullable(),
  meta: z.object({
    latencyMs: z.number(),
    model: z.string(),
    fallback: z.boolean(),
  }),
});
export type PhotoResponse = z.infer<typeof PhotoResponseSchema>;

/* ------------------------------------------------------------------ */
/* Answers — shared so client and server never disagree                */
/* ------------------------------------------------------------------ */

export function normalizeAnswer(input: string, caseSensitive = false): string {
  const stripped = input.trim().replace(/^(?:the|a|an)\s+/i, "");
  const tidy = stripped.replace(/[\s\-_.,:;'"`]/g, "");
  return caseSensitive ? tidy : tidy.toLowerCase();
}

export function checkAnswer(
  input: string,
  answers: readonly string[],
  caseSensitive = false,
): boolean {
  const got = normalizeAnswer(input, caseSensitive);
  if (!got) return false;
  return answers.some((a) => normalizeAnswer(a, caseSensitive) === got);
}
