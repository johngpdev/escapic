import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";

/**
 * Node 24 loads .env natively — no dotenv dependency, no bundler config.
 * We look in cwd first (apps/api when run via npm -w) then the repo root.
 */
for (const candidate of [".env", "../../.env", "../../../.env"]) {
  const p = resolve(process.cwd(), candidate);
  if (existsSync(p)) {
    try {
      loadEnvFile(p);
    } catch {
      /* already loaded */
    }
  }
}

const bool = (v: string | undefined, dflt = false) =>
  v === undefined ? dflt : /^(1|true|yes|on)$/i.test(v);

export const env = {
  geminiKey: process.env.GEMINI_API_KEY ?? "",
  models: (process.env.GEMINI_MODELS ?? "gemini-flash-lite-latest,gemini-3.5-flash-lite")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean),
  /**
   * Gemini 3.x rejects thinkingConfig with a 400, so it is off by default.
   * Turn this on only if you switch back to a 2.5-generation model.
   */
  thinkingOff: bool(process.env.GEMINI_THINKING_OFF, false),
  demoOnly: bool(process.env.DEMO_ONLY, false),
  port: Number(process.env.PORT ?? 8787),
  /** Default ceiling for any model call. */
  timeoutMs: Number(process.env.SCAN_TIMEOUT_MS ?? 12000),
  /**
   * The case call writes ~4.4k chars of JSON and takes ~6.3s on 2.5 Flash with
   * thinking disabled. It runs on boot, behind the landing screen, so a long
   * ceiling costs nothing. A 4.5s timeout here is a guaranteed failure.
   */
  caseTimeoutMs: Number(process.env.CASE_TIMEOUT_MS ?? 20000),
  /** The player is watching this one, so keep it tight and the output small. */
  captureTimeoutMs: Number(process.env.CAPTURE_TIMEOUT_MS ?? 12000),
};

export const hasKey = () => env.geminiKey.length > 10;
