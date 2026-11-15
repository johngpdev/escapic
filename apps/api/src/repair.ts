import {
  PhotoResponseSchema,
  RoundSchema,
  normalizeBox,
  type Box,
  type PhotoResponse,
  type Round,
} from "@escape/shared";

type Json = Record<string, unknown>;

const str = (v: unknown, fallback: string, max = 240): string =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : fallback;

const parse = (raw: string): Json => {
  const clean = raw.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "").trim();
  try {
    return JSON.parse(clean) as Json;
  } catch {
    throw new Error("model did not return JSON");
  }
};

function toBox(raw: unknown): Box | null {
  if (!Array.isArray(raw) || raw.length < 4) return null;
  const nums = raw.map((n) => (typeof n === "number" && Number.isFinite(n) ? n : NaN));
  if (nums.some(Number.isNaN)) return null;
  const [a, b, c, d] = nums as number[];
  const scale = Math.max(a!, b!, c!, d!) <= 1.001 ? 1 : 1000;
  const box = normalizeBox({ ymin: a! / scale, xmin: b! / scale, ymax: c! / scale, xmax: d! / scale });
  if (box.xmax - box.xmin < 0.03 || box.ymax - box.ymin < 0.03) return null;
  return box;
}

export function repairRounds(rawText: string, count = 5): Round[] {
  const raw = parse(rawText);
  const list = Array.isArray(raw.rounds) ? (raw.rounds as Json[]) : [];
  if (list.length === 0) throw new Error("no riddles");

  return list.slice(0, count).map((r, i) => {
    const answer = str(r.answer, "object", 40).toLowerCase();
    const round: Round = {
      id: `r${i + 1}`,
      order: i + 1,
      prompt: str(r.prompt, "Something in this room does not belong.", 180),
      category: str(r.category, answer, 140),
      seekHint: str(r.seekHint, "Look around the room.", 180),
      answer,
    };
    RoundSchema.parse(round);
    return round;
  });
}

export function repairPhoto(rawText: string): PhotoResponse {
  const raw = parse(rawText);
  const matched = raw.matched === true;
  const answers = (Array.isArray(raw.bonusAnswers) ? raw.bonusAnswers : [])
    .map((a) => String(a).trim().toLowerCase())
    .filter((a) => a.length > 0 && a.length <= 24)
    .slice(0, 4);

  const question = str(raw.bonusQuestion, "", 180);

  const response: PhotoResponse = {
    matched,
    reason: str(raw.reason, matched ? "Looks right." : "That doesn't match.", 240),
    label: str(raw.label, "object", 48),
    box: toBox(raw.box2d),
    bonus: matched && question ? { question, answers: answers.length ? answers : ["yes"] } : null,
    meta: { latencyMs: 0, model: "", fallback: false },
  };

  PhotoResponseSchema.parse(response);
  return response;
}
