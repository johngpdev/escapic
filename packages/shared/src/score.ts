/**
 * No points. The clock is the score: elapsed time plus penalties.
 * Shared so the client and the podium can never disagree.
 */
import type { RoomConfig } from "./schema.js";

export const PENALTY_MS = {
  EASY: { wrongPhoto: 5000, wrongBonus: 10000 },
  MEDIUM: { wrongPhoto: 10000, wrongBonus: 20000 },
  HARD: { wrongPhoto: 15000, wrongBonus: 30000 },
  EXTREME: { wrongPhoto: 20000, wrongBonus: 40000 },
  IMPOSSIBLE: { wrongPhoto: 30000, wrongBonus: 60000 },
} as const;

export const wrongPhotoPenalty = (d: RoomConfig["difficulty"]) => PENALTY_MS[d].wrongPhoto;
export const wrongBonusPenalty = (d: RoomConfig["difficulty"]) => PENALTY_MS[d].wrongBonus;

export const ROUND_MAX = 150;

/** 2:30 per round; every second costs a point, floor zero. */
export function roundPoints(seconds: number): number {
  return Math.max(0, Math.min(ROUND_MAX, Math.round(ROUND_MAX - seconds)));
}

export const finalMs = (p: { ms: number; penalty: number }) => p.ms + p.penalty;

export function formatMs(ms: number): string {
  const s = Math.max(0, Math.round(ms / 100) / 10);
  const m = Math.floor(s / 60);
  const rest = (s - m * 60).toFixed(1);
  return m > 0 ? `${m}:${rest.padStart(4, "0")}` : `${rest}s`;
}

/** Lowest final time wins; anyone who never finished ranks below everyone who did. */
export const comparePlayers = (
  a: { ms: number; penalty: number; round: number; done: boolean },
  b: { ms: number; penalty: number; round: number; done: boolean },
): number => {
  if (a.done !== b.done) return a.done ? -1 : 1;
  if (a.done && b.done) return finalMs(a) - finalMs(b);
  return b.round - a.round || finalMs(a) - finalMs(b);
};

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function roomCode(seed: number): string {
  let n = Math.abs(seed) % (32 ** 4);
  let out = "";
  for (let i = 0; i < 4; i++) {
    out += ALPHABET[n % 32];
    n = Math.floor(n / 32);
  }
  return out;
}
