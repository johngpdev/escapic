import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/** One JSON file. No database, atomic writes, single instance. */

export interface PlayerStats {
  key: string;
  name: string;
  games: number;
  points: number;
  firsts: number;
  best: number;
}

export interface LocationRecord {
  name: string;
  players: string[];
  games: number;
  lastPlayed: number;
}

interface Store {
  players: Record<string, PlayerStats>;
  locations: Record<string, LocationRecord>;
}

const FILE = resolve(process.cwd(), "../../data/stats.json");
let cache: Store | null = null;

function load(): Store {
  if (cache) return cache;
  let parsed: Partial<Store> | null = null;
  try {
    if (existsSync(FILE)) parsed = JSON.parse(readFileSync(FILE, "utf8")) as Partial<Store>;
  } catch {
    parsed = null;
  }
  cache = {
    players: parsed && typeof parsed.players === "object" && parsed.players ? parsed.players : {},
    locations:
      parsed && typeof parsed.locations === "object" && parsed.locations ? parsed.locations : {},
  };
  return cache;
}

function save(store: Store) {
  try {
    mkdirSync(dirname(FILE), { recursive: true });
    const tmp = `${FILE}.tmp`;
    writeFileSync(tmp, JSON.stringify(store, null, 2), "utf8");
    renameSync(tmp, FILE);
  } catch (e) {
    console.warn(`[stats] write failed: ${e instanceof Error ? e.message : e}`);
  }
}

export function recordGame(input: {
  key: string;
  name: string;
  points: number;
  first: boolean;
  location?: string;
}): PlayerStats {
  const store = load();
  const prev =
    store.players[input.key] ??
    ({ key: input.key, name: input.name, games: 0, points: 0, firsts: 0, best: 0 } as PlayerStats);

  const next: PlayerStats = {
    key: input.key,
    name: input.name.slice(0, 12) || prev.name,
    games: prev.games + 1,
    points: prev.points + Math.max(0, Math.round(input.points)),
    firsts: prev.firsts + (input.first ? 1 : 0),
    best: Math.max(prev.best, Math.round(input.points)),
  };
  store.players[input.key] = next;

  const loc = (input.location ?? "").trim().slice(0, 60);
  if (loc) {
    const rec = store.locations[loc] ?? { name: loc, players: [], games: 0, lastPlayed: 0 };
    if (!rec.players.includes(input.key)) rec.players.push(input.key);
    rec.games += 1;
    rec.lastPlayed = Date.now();
    store.locations[loc] = rec;
  }

  save(store);
  return next;
}

export function personal(key: string): PlayerStats | null {
  return load().players[key] ?? null;
}

export function globalBoards(limit = 10) {
  const all = Object.values(load().players);
  return {
    topPoints: [...all].sort((a, b) => b.points - a.points).slice(0, limit),
    topFirsts: [...all].sort((a, b) => b.firsts - a.firsts || b.points - a.points).slice(0, limit),
    totalPlayers: all.length,
  };
}

/** Rarest places: fewest distinct players, most recent as the tie-break. */
export function locationBoard(limit = 3) {
  return Object.values(load().locations)
    .sort((a, b) => a.players.length - b.players.length || b.lastPlayed - a.lastPlayed)
    .slice(0, limit)
    .map((l) => ({ name: l.name, players: l.players.length, games: l.games }));
}

/**
 * Players ranked by how obscure the places they've played are: the rarest
 * location wins, ties broken by how many rare locations they've collected.
 */
export function nichePlayers(limit = 3) {
  const store = load();
  const rows = Object.values(store.players).map((p) => {
    const mine = Object.values(store.locations).filter((l) => l.players.includes(p.key));
    const rarest = [...mine].sort((a, b) => a.players.length - b.players.length)[0] ?? null;
    const rareCount = mine.filter((l) => l.players.length <= 1).length;
    return {
      key: p.key,
      name: p.name,
      location: rarest?.name ?? "",
      players: rarest?.players.length ?? Number.MAX_SAFE_INTEGER,
      rareCount,
    };
  });
  return rows
    .filter((r) => r.location)
    .sort((a, b) => a.players - b.players || b.rareCount - a.rareCount)
    .slice(0, limit)
    .map(({ key, name, location, players }) => ({ key, name, location, players }));
}

export function personalLocations(key: string) {
  const mine = Object.values(load().locations).filter((l) => l.players.includes(key));
  const rarest = [...mine].sort((a, b) => a.players.length - b.players.length)[0] ?? null;
  return {
    visited: mine.length,
    rarest: rarest ? { name: rarest.name, players: rarest.players.length } : null,
  };
}
