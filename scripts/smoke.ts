import {
  checkAnswer,
  comparePlayers,
  finalMs,
  fixturePhoto,
  fixtureRoom,
  formatMs,
  fromBox2d,
  normalizeAnswer,
  projectBox,
  roomCode,
  wrongBonusPenalty,
  wrongPhotoPenalty,
} from "@escape/shared";
import { repairPhoto, repairRounds } from "../apps/api/src/repair.js";

let fails = 0;
const ok = (n: string, c: boolean, x = "") => {
  if (!c) fails++;
  console.log(`  ${c ? "ok " : "FAIL"}  ${n}${x ? "  " + x : ""}`);
};

console.log("\nprojection");
{
  const vp = { width: 393, height: 852 };
  const p = projectBox({ ymin: 0.4, xmin: 0.4, ymax: 0.6, xmax: 0.6 }, vp, { width: 720, height: 1280 });
  ok("centre lands centre", Math.abs(p.left + p.width / 2 - 196.5) < 1 && Math.abs(p.top + p.height / 2 - 426) < 1);
  const f = projectBox({ ymin: 0, xmin: 0, ymax: 1, xmax: 1 }, vp, { width: 720, height: 1280 });
  ok("full frame covers viewport", f.left <= 0.01 && f.top <= 0.01);
}

console.log("\ntime");
{
  ok("penalties scale with difficulty", wrongPhotoPenalty("EASY") < wrongPhotoPenalty("HARD"));
  ok("bonus penalties are heavier", wrongBonusPenalty("MEDIUM") > wrongPhotoPenalty("MEDIUM"));
  ok("final time adds penalties", finalMs({ ms: 10000, penalty: 3000 }) === 13000);
  ok("formats under a minute", formatMs(12400) === "12.4s");
  const a = { ms: 9000, penalty: 0, round: 5, done: true };
  const b = { ms: 8000, penalty: 10000, round: 5, done: true };
  ok("penalties decide the win", comparePlayers(a, b) < 0);
  const c = { ms: 1000, penalty: 0, round: 2, done: false };
  ok("unfinished ranks last", comparePlayers(c, b) > 0);
}

console.log("\nanswers");
{
  ok("case + article", checkAnswer("The Curator", ["curator"]));
  ok("digits with punctuation", checkAnswer("23:42", ["2342"]));
  ok("rejects wrong", !checkAnswer("mug", ["cup"]));
  ok("empty rejected", !checkAnswer("   ", ["cup"]));
  ok("normalise strips separators", normalizeAnswer("a-b c") === "abc");
}

console.log("\nrooms");
{
  const r = fixtureRoom(1234);
  ok("fixture room honours its config", r.rounds.length === r.config.rounds && r.rounds.length >= 5);
  ok("codes are 4 chars", roomCode(999).length === 4 && roomCode(1).length === 4);
  ok("codes are stable", roomCode(4242) === roomCode(4242));
  ok("codes avoid ambiguity", !/[IO01]/.test(roomCode(777)));
  ok("fixture photo accepts", fixturePhoto().matched === true);
}

console.log("\nrepair · rounds");
{
  const raw = JSON.stringify({
    rounds: [
      { prompt: "It counts.", category: "something that tells the time", seekHint: "A clock.", answer: "Clock" },
      { prompt: "It holds.", category: "something that holds a drink", seekHint: "A cup.", answer: "cup" },
      { prompt: "It reads.", category: "something with text", seekHint: "A book." },
    ],
  });
  const rounds = repairRounds(raw);
  ok("3 rounds", rounds.length === 3);
  ok("ids are ordered", rounds.map((r) => r.id).join() === "r1,r2,r3");
  ok("answers lowercased", rounds[0]!.answer === "clock");
  ok("missing answer falls back", rounds[2]!.answer.length > 0);
}

console.log("\nrepair · photo");
{
  const yes = repairPhoto(JSON.stringify({ matched: true, reason: "A clock at 4:07.", label: "clock", box2d: [200, 250, 700, 620], bonusQuestion: "What time does it read?", bonusAnswers: ["4:07", "407"] }));
  ok("matched parsed", yes.matched === true);
  ok("box normalised", yes.box !== null && yes.box.xmax <= 1);
  ok("bonus kept", yes.bonus?.answers.includes("4:07") === true);

  const no = repairPhoto(JSON.stringify({ matched: false, reason: "That's a wall socket.", label: "socket" }));
  ok("rejection has no box", no.box === null);
  ok("rejection has no bonus", no.bonus === null);
  ok("rejection keeps reason", no.reason.includes("socket"));

  const flip = repairPhoto(JSON.stringify({ matched: true, reason: "x", label: "x", box2d: [700, 600, 200, 100] }));
  ok("flipped box repaired", flip.box !== null && flip.box.ymin <= flip.box.ymax && flip.box.xmin <= flip.box.xmax);
}

console.log(fails === 0 ? "\nALL GREEN\n" : `\n${fails} FAILURE(S)\n`);
process.exit(fails === 0 ? 0 : 1);
