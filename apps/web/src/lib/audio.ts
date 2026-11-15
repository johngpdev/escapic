/**
 * Zero-asset audio. Every sound is synthesised, so there is nothing to
 * download and nothing to 404 on stage.
 *
 * iOS specifics:
 *  - The AudioContext must be resumed inside a user gesture.
 *  - The hardware mute switch silences WebAudio unless a media element is
 *    playing. `primeAudio()` starts a silent looping <audio> to keep the
 *    audio session in "playback" mode. This is the difference between a demo
 *    with sound and a demo with embarrassed silence.
 */

let ctx: AudioContext | null = null;
let primed = false;

const SILENT_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=";

export function primeAudio(): void {
  if (primed) {
    void ctx?.resume();
    return;
  }
  primed = true;

  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (Ctor) {
    ctx = new Ctor();
    void ctx.resume();
  }

  try {
    const el = document.createElement("audio");
    el.src = SILENT_WAV;
    el.loop = true;
    el.volume = 0.001;
    el.setAttribute("playsinline", "");
    document.body.appendChild(el);
    void el.play().catch(() => undefined);
  } catch {
    /* non-fatal */
  }
}

type Wave = "sine" | "square" | "triangle" | "sawtooth";

function tone(freq: number, at: number, dur: number, type: Wave, gain: number, endFreq?: number) {
  if (!ctx) return;
  const t0 = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export type SfxName = "click" | "deny_soft" | "unlock" | "unlock_deep" | "chime" | "scan";

export function sfx(name: SfxName): void {
  if (!ctx) return;
  void ctx.resume();
  switch (name) {
    case "click":
      tone(880, 0, 0.05, "square", 0.05);
      break;
    case "scan":
      tone(220, 0, 0.5, "sawtooth", 0.04, 660);
      tone(440, 0.1, 0.4, "sine", 0.03, 880);
      break;
    case "deny_soft":
      tone(150, 0, 0.16, "square", 0.06, 110);
      tone(110, 0.1, 0.2, "square", 0.05, 80);
      break;
    case "unlock":
      [523.25, 659.25, 783.99].forEach((f, i) => tone(f, i * 0.07, 0.28, "triangle", 0.07));
      break;
    case "unlock_deep":
      [392, 523.25, 659.25, 783.99].forEach((f, i) => tone(f, i * 0.06, 0.36, "sine", 0.07));
      tone(196, 0, 0.6, "triangle", 0.04);
      break;
    case "chime":
      [1046.5, 1318.5, 1568, 2093].forEach((f, i) => tone(f, i * 0.09, 0.7, "sine", 0.05));
      break;
  }
}
