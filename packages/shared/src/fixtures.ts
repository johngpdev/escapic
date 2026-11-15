import { fromBox2d } from "./schema.js";
import type { PhotoResponse, Room, RoomConfig, Round } from "./schema.js";

/** Offline rounds. Used by ?demo=1 and whenever the model is unavailable. */
export const fixtureRounds: Round[] = [
  { id: "r1", order: 1, prompt: "It counts when nobody is watching.", category: "something that tells the time", seekHint: "A clock, a watch, a phone, an oven display.", answer: "clock" },
  { id: "r2", order: 2, prompt: "It holds what you are about to drink, and never says thank you.", category: "something that holds a drink", seekHint: "A cup, a glass, a bottle, a can.", answer: "cup" },
  { id: "r3", order: 3, prompt: "It carries words but has no mouth.", category: "something with text printed on it", seekHint: "A book, a label, a box, a screen.", answer: "book" },
  { id: "r4", order: 4, prompt: "It gives light, and takes a switch.", category: "something that produces light", seekHint: "A lamp, a ceiling light, a screen, a torch.", answer: "lamp" },
  { id: "r5", order: 5, prompt: "It has a spine but no bones.", category: "a book or a bound stack of paper", seekHint: "A notebook, a manual, a shelf of them.", answer: "book" },
  { id: "r6", order: 6, prompt: "It holds a chair off the floor.", category: "a table or desk", seekHint: "Any flat surface with legs.", answer: "table" },
  { id: "r7", order: 7, prompt: "It keeps a dead thing alive.", category: "a plant", seekHint: "A pot, a stem, a window sill.", answer: "plant" },
  { id: "r8", order: 8, prompt: "It is worn and never walked in.", category: "an item of clothing", seekHint: "A jumper, a coat, a shoe.", answer: "clothing" },
  { id: "r9", order: 9, prompt: "It writes, but says nothing.", category: "a pen or pencil", seekHint: "A mug of them, a drawer.", answer: "pen" },
  { id: "r10", order: 10, prompt: "It has a face and no expression.", category: "something that tells the time", seekHint: "A clock, a watch.", answer: "clock" },
];

export const fixtureRoom = (
  seed: number,
  hostId = "p_host",
  name = "Host",
  config: RoomConfig = { difficulty: "MEDIUM", rounds: 5, limitMin: 10, venue: "HOME" },
): Room => ({
  code: "DEMO",
  seed,
  status: "lobby",
  hostId,
  config,
  rounds: fixtureRounds.slice(0, config.rounds),
  players: [{ id: hostId, name, ms: 0, penalty: 0, round: 0, done: false }],
  startedAt: null,
  createdAt: Date.now(),
});

export const fixturePhoto = (): PhotoResponse => ({
  matched: true,
  reason: "Offline mode: the object is taken on trust.",
  label: "object",
  box: fromBox2d([300, 250, 700, 700]),
  bonus: {
    question: "What is the most obvious colour on it?",
    answers: ["black", "white", "grey", "gray", "red", "blue", "green", "brown"],
  },
  meta: { latencyMs: 0, model: "local-fixture", fallback: true },
});
