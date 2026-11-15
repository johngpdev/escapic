/** Decisive test: does the verifier actually reject a photo that contains nothing? */
import { chromium } from "playwright";

const BASE = "http://localhost:8787";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 480, height: 640 } });
await page.setContent(
  `<body style="margin:0;background:#1d7a2a;width:100vw;height:100vh"><div style="position:absolute;top:40%;left:10%;width:80%;height:20%;background:#7ddc55"></div></body>`,
);
const buf = await page.screenshot({ type: "jpeg", quality: 60 });
await browser.close();

const b64 = Buffer.from(buf).toString("base64");
console.log("image bytes:", buf.length);

const cases = [
  { prompt: "It counts when nobody is watching.", category: "something that tells the time" },
  { prompt: "It carries words but has no mouth.", category: "something with text printed on it" },
];

for (const c of cases) {
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/photo`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ imageB64: b64, prompt: c.prompt, category: c.category }),
  });
  const body = await res.json().catch(() => ({}));
  console.log(`\n${res.status} in ${Date.now() - t0}ms`);
  console.log(JSON.stringify(body, null, 2).slice(0, 700));
}
