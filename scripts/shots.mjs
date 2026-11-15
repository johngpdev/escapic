/**
 * Headless race: entry -> lobby -> 3 rounds -> podium.
 *   npm run build && npm run start
 *   node scripts/shots.mjs
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = process.env.SHOT_DIR ?? "C:/Users/johng/AppData/Local/Temp/opencode/shots";
const BASE = process.env.BASE_URL ?? "http://localhost:8787";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
});
const ctx = await browser.newContext({
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  permissions: ["camera"],
});
const page = await ctx.newPage();

const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});

const shot = async (name) => {
  await page.waitForTimeout(550);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log("shot", name);
};

const playRound = async (label) => {
  await page.locator(".shutter").click();
  await page.waitForTimeout(1500);
  if (label) await shot(label);
  await page.getByPlaceholder("Your answer").fill("black");
  await page.getByRole("button", { name: /lock it in/i }).click();
  await page.waitForTimeout(500);
};

await page.goto(`${BASE}/?demo=1`, { waitUntil: "networkidle" });
await shot("01-entry");

await page.getByPlaceholder("Your name").fill("Johng");
await page.getByRole("button", { name: /create a room/i }).click();
await page.waitForTimeout(2200);
await shot("02-lobby");

await page.getByRole("button", { name: /start the race/i }).click();
await page.waitForTimeout(900);
await shot("03-round");

await page.getByRole("button", { name: /stuck\?/i }).click();
await shot("04-hint");

await playRound("05-verdict");
await shot("06-result");

await page.getByRole("button", { name: /next riddle/i }).click();
await page.waitForTimeout(600);
await playRound(null);
await page.getByRole("button", { name: /next riddle/i }).click();
await page.waitForTimeout(600);
await playRound(null);
await shot("07-final-result");
await page.getByRole("button", { name: /see results/i }).click();
await page.waitForTimeout(1400);
await shot("08-podium");

console.log("errors:", errors.length ? errors : "none");
await browser.close();
