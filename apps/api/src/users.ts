import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * File-backed accounts. No database, no email, no password reset — a demo-grade
 * identity store. Passwords are scrypt-hashed with a per-user salt; tokens are
 * random and rotate on every login.
 */

export interface User {
  id: string;
  name: string;
  salt: string;
  hash: string;
  token: string;
  location: string;
  createdAt: number;
}

interface Store {
  users: Record<string, User>;
}

const FILE = resolve(process.cwd(), "../../data/users.json");
let cache: Store | null = null;

function load(): Store {
  if (cache) return cache;
  try {
    if (existsSync(FILE)) cache = JSON.parse(readFileSync(FILE, "utf8")) as Store;
  } catch {
    cache = null;
  }
  if (!cache || typeof cache.users !== "object") cache = { users: {} };
  return cache;
}

function save(store: Store) {
  try {
    mkdirSync(dirname(FILE), { recursive: true });
    const tmp = `${FILE}.tmp`;
    writeFileSync(tmp, JSON.stringify(store, null, 2), "utf8");
    renameSync(tmp, FILE);
  } catch (e) {
    console.warn(`[users] write failed: ${e instanceof Error ? e.message : e}`);
  }
}

const hash = (password: string, salt: string) => scryptSync(password, salt, 64).toString("hex");

const publicUser = (u: User) => ({
  id: u.id,
  name: u.name,
  location: u.location,
  createdAt: u.createdAt,
});

export function register(name: string, password: string, location = "") {
  const store = load();
  const key = name.trim().toLowerCase();
  if (key.length < 2) throw new Error("name must be at least 2 characters");
  if (password.length < 4) throw new Error("password must be at least 4 characters");
  if (store.users[key]) throw new Error("that name is taken");

  const salt = randomBytes(16).toString("hex");
  const user: User = {
    id: randomBytes(8).toString("hex"),
    name: name.trim().slice(0, 12),
    salt,
    hash: hash(password, salt),
    token: randomBytes(24).toString("hex"),
    location: location.slice(0, 60),
    createdAt: Date.now(),
  };
  store.users[key] = user;
  save(store);
  return { token: user.token, user: publicUser(user) };
}

export function login(name: string, password: string) {
  const store = load();
  const user = store.users[name.trim().toLowerCase()];
  if (!user) throw new Error("no such account");

  const attempt = Buffer.from(hash(password, user.salt), "hex");
  const stored = Buffer.from(user.hash, "hex");
  if (attempt.length !== stored.length || !timingSafeEqual(attempt, stored)) {
    throw new Error("wrong password");
  }
  user.token = randomBytes(24).toString("hex");
  save(store);
  return { token: user.token, user: publicUser(user) };
}

export function userForToken(token: string) {
  if (!token) return null;
  const store = load();
  const match = Object.values(store.users).find((u) => u.token === token);
  return match ? publicUser(match) : null;
}

export function setLocation(token: string, location: string) {
  const store = load();
  const match = Object.values(store.users).find((u) => u.token === token);
  if (!match) return null;
  match.location = location.slice(0, 60);
  save(store);
  return publicUser(match);
}
