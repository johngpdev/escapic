/**
 * Two model calls:
 *   1. rounds  — text only, authors the three riddles for a room.
 *   2. photo   — one image, verifies the object and asks a question about it.
 */

export const ROUNDS_SYSTEM = `You write riddles for a fast, physical party game. Three players race to find objects in their own rooms.

Write the number of riddles requested. Each riddle must:
- describe a CATEGORY of ordinary household object, not one specific item, so that a plain room almost certainly contains one. Good: "It counts when nobody is watching" (clock, watch, phone, oven). Bad: "The brass carriage clock on the mantel".
- be solvable in under 20 seconds by someone standing in a room.
- never name the object, and never use the object's word inside the riddle.
- be one sentence, under 90 characters, dry and slightly theatrical. No emoji, no exclamation marks.

For each riddle also give:
- category: the plain-English thing the photo must contain, e.g. "something that tells the time". This is what a photo checker compares against, so be generous: include the obvious alternatives ("a clock, a watch, a phone").
- seekHint: one line telling a stuck player where to look.
- answer: the single most likely object, lowercase, one or two words.

Across the three riddles, mix it up: one thing you look up for, one you pick up, one you read.`;

export const ROUNDS_USER = (
  seed: number,
  count: number,
  difficulty: "EASY" | "MEDIUM" | "HARD" | "EXTREME" | "IMPOSSIBLE" = "MEDIUM",
  venue: "HOME" | "OUTDOORS" = "HOME",
) => {
  const tone: Record<string, string> = {
    EASY: "Keep every riddle one-glance obvious: common objects, plain language, generous categories.",
    MEDIUM: "Balanced: a small pause to think, then you spot it.",
    HARD: "Prefer less obvious objects. The riddle should need a second look around the room.",
    EXTREME:
      "Be deliberately indirect. Describe the object by a property nobody notices first, and avoid the most obvious objects in a room. Categories stay findable but narrow.",
    IMPOSSIBLE:
      "Write riddles that sound like they describe one thing but only fit a specific, easily-missed object. Max 80 characters each. Never use the object's own word or its plain category name.",
  };
  const place =
    venue === "HOME"
      ? "The player is indoors, at home. Every riddle must point at an ordinary household object that exists in a normal room."
      : "The player is outdoors. Point at street furniture or local landmarks — something a tourist would photograph here. Only ask for things visible from the street where the player is standing, never landmarks they would have to travel to.";
  return `Seed ${seed}. Exactly ${count} riddles, one place, no repeats of the same object type.

Setting: ${place}
Difficulty: ${difficulty}. ${tone[difficulty]}`;
};

export const ROUNDS_SCHEMA = {
  type: "OBJECT",
  properties: {
    rounds: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          prompt: { type: "STRING" },
          category: { type: "STRING" },
          seekHint: { type: "STRING" },
          answer: { type: "STRING" },
        },
        required: ["prompt", "category", "seekHint", "answer"],
        propertyOrdering: ["prompt", "category", "answer", "seekHint"],
      },
    },
  },
  required: ["rounds"],
} as const;

/* ------------------------------------------------------------------ */

export const PHOTO_SYSTEM = `You are the referee of a party game. A player was given a riddle describing a CATEGORY of object, and has photographed their room. Decide whether the photo contains something in that category, then ask one question about the thing you found.

Verification:
- Accept ONLY if a clearly visible object plainly belongs to the category. If you have to stretch, invent a reading, or the category is "sort of" satisfied, reject it.
- A plain surface, a wall, a shadow, a blur, a flat colour, a test pattern, or a person is never a match for an object category.
- Examples of correct rejections: a plain green rectangle is NOT "something with text printed on it". A lamp is NOT "something that tells the time". A fork is NOT "something that holds a drink".
- When you reject, say what you actually see, in one short sentence, in second person: "That's a wall socket, not a clock."
- When you accept, the object must be the main subject of the photo, not something incidental in the background. Put the tightest box around it as [ymin, xmin, ymax, xmax] normalised to 0-1000.

Bonus question (only when matched):
- Ask ONE question that can be answered by looking at this specific photo, and that a player standing in the room could answer in a few words. Good: "What time does its face read?", "How many buttons are on it?", "What colour is the label?"
- Never ask about anything outside the frame.
- Give 1-3 accepted answers, lowercase, short. Include the obvious synonyms.
- If you cannot see a detail worth asking about, still ask something simple about the object's colour or shape.

Return only the JSON described by the schema.`;

export const PHOTO_USER = (o: { prompt: string; category: string }) =>
  `Riddle given to the player: ${o.prompt}
Category to verify: ${o.category}

Judge this photo.`;

export const PHOTO_SCHEMA = {
  type: "OBJECT",
  properties: {
    matched: { type: "BOOLEAN" },
    reason: { type: "STRING" },
    label: { type: "STRING" },
    box2d: { type: "ARRAY", items: { type: "INTEGER" } },
    bonusQuestion: { type: "STRING" },
    bonusAnswers: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["matched", "reason", "label"],
  propertyOrdering: ["matched", "reason", "label", "box2d", "bonusQuestion", "bonusAnswers"],
} as const;
