import { env } from "./env.js";

/**
 * Raw REST calls instead of an SDK: no version drift on hackathon night, and we
 * can log the exact request/response when a model starts emitting malformed
 * JSON at 2am.
 *
 * One entry point for both calls — text-only (case) and multimodal (capture).
 */

interface Attempt {
  model: string;
  ok: boolean;
  error?: string;
  status?: number;
}

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/** Google returns these under load. They are worth one retry, not a surrender. */
const TRANSIENT = new Set([429, 500, 502, 503, 504]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function generateJson(opts: {
  system: string;
  user: string;
  schema: unknown;
  imageB64?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}): Promise<{ text: string; model: string; attempts: Attempt[] }> {
  const attempts: Attempt[] = [];
  const ceiling = opts.timeoutMs ?? env.timeoutMs;
  if (!env.geminiKey) throw new Error("GEMINI_API_KEY missing");

  for (const model of env.models) {
    const configs = env.thinkingOff ? [true, false] : [false];

    for (const withThinking of configs) {
      // one transient retry per config, so a 503 spike doesn't kill the demo
      for (let attempt = 0; attempt <= 1; attempt++) {
        try {
          const parts: Record<string, unknown>[] = [];
          if (opts.imageB64) {
            parts.push({ inlineData: { mimeType: "image/jpeg", data: opts.imageB64 } });
          }
          parts.push({ text: opts.user });

          const body: Record<string, unknown> = {
            systemInstruction: { parts: [{ text: opts.system }] },
            contents: [{ role: "user", parts }],
            generationConfig: {
              responseMimeType: "application/json",
              responseSchema: opts.schema,
              temperature: opts.temperature ?? 0.9,
              maxOutputTokens: opts.maxTokens ?? 2048,
              ...(withThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
            },
          };

          const res = await fetch(`${ENDPOINT}/${model}:generateContent?key=${env.geminiKey}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(ceiling),
          });

          if (!res.ok) {
            const errText = await res.text();
            attempts.push({ model, ok: false, status: res.status, error: errText.slice(0, 300) });
            console.warn(`[gemini] ${model} HTTP ${res.status} (thinking=${withThinking})`);

            if (TRANSIENT.has(res.status) && attempt === 0) {
              await sleep(700);
              continue;
            }
            // 400 usually means this model rejects thinkingConfig — retry without.
            if (res.status === 400 && withThinking) break;
            break;
          }

          const json = (await res.json()) as {
            candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
          };
          const text = (json.candidates?.[0]?.content?.parts ?? [])
            .map((p) => p.text ?? "")
            .join("")
            .trim();

          attempts.push({ model, ok: !!text, status: 200, error: text ? undefined : "empty text" });
          if (text) return { text, model, attempts };
          break;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          attempts.push({ model, ok: false, error: msg });
          console.warn(`[gemini] ${model} threw: ${msg}`);
          break;
        }
      }
    }
  }

  console.error("[gemini] all models failed", attempts);
  throw new Error("all models failed");
}
