import type { Box } from "./schema.js";

/**
 * Screen-space projection.
 *
 * The camera frame is displayed with CSS `object-fit: cover`, which CROPS the
 * video to fill the viewport. Every naive implementation forgets the crop and
 * the holograms drift into the corner on a 19.5:9 phone. This is the only
 * function allowed to convert a normalised box into pixels — the overlay and
 * the hit-testing both call it, so they can never disagree.
 */
export interface ProjectedBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function projectBox(
  box: Box,
  viewport: { width: number; height: number },
  video: { width: number; height: number },
): ProjectedBox {
  const vw = viewport.width;
  const vh = viewport.height;
  const vwid = video.width || 1;
  const vhei = video.height || 1;

  // "cover": scale so the video covers the viewport, then centre-crop.
  const scale = Math.max(vw / vwid, vh / vhei);
  const dw = vwid * scale;
  const dh = vhei * scale;
  const ox = (vw - dw) / 2;
  const oy = (vh - dh) / 2;

  return {
    left: ox + box.xmin * dw,
    top: oy + box.ymin * dh,
    width: (box.xmax - box.xmin) * dw,
    height: (box.ymax - box.ymin) * dh,
  };
}

/** Inverse of projectBox — used when the player taps the screen manually. */
export function unprojectPoint(
  point: { x: number; y: number },
  viewport: { width: number; height: number },
  video: { width: number; height: number },
): { x: number; y: number } {
  const scale = Math.max(viewport.width / video.width, viewport.height / video.height);
  const dw = video.width * scale;
  const dh = video.height * scale;
  const ox = (viewport.width - dw) / 2;
  const oy = (viewport.height - dh) / 2;
  return {
    x: Math.min(1, Math.max(0, (point.x - ox) / dw)),
    y: Math.min(1, Math.max(0, (point.y - oy) / dh)),
  };
}

/** A tappable box around a point, for the manual "I found it" anchor. */
export function boxAroundPoint(p: { x: number; y: number }, w = 0.22, h = 0.16): Box {
  return {
    xmin: Math.min(1 - w, Math.max(0, p.x - w / 2)),
    ymin: Math.min(1 - h, Math.max(0, p.y - h / 2)),
    xmax: Math.min(1, Math.max(w, p.x + w / 2)),
    ymax: Math.min(1, Math.max(h, p.y + h / 2)),
  };
}

/**
 * One Euro filter — the jitter/stability tradeoff you actually want for a
 * hologram: heavy smoothing when the phone is still, low lag when it swings.
 * (Plain EMA either jitters or lags; this does neither.)
 */
export class OneEuroFilter {
  private x: number | null = null;
  private dx = 0;
  private t = 0;

  constructor(
    private readonly minCutoff = 1.2,
    private readonly beta = 0.09,
    private readonly dCutoff = 1.0,
  ) {}

  private alpha(cutoff: number, dt: number) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  filter(value: number, nowMs = performance.now()): number {
    if (this.x === null) {
      this.x = value;
      this.t = nowMs;
      return value;
    }
    const dt = Math.max(1, nowMs - this.t) / 1000;
    this.t = nowMs;

    const dv = (value - this.x) / dt;
    this.dx += this.alpha(this.dCutoff, dt) * (dv - this.dx);

    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += this.alpha(cutoff, dt) * (value - this.x);
    return this.x;
  }

  reset() {
    this.x = null;
    this.dx = 0;
  }
}

/**
 * Rejection gate. A detection that jumps further than `maxShift` (fraction of
 * viewport height) or overlaps the held box less than `minIou` is treated as a
 * tracking failure, not a real move. Returning false here is what stops the
 * hologram from teleporting onto the wrong object mid-demo.
 */
export function acceptDetection(
  held: Box | null,
  incoming: Box,
  opts: { minIou?: number; maxShift?: number } = {},
): boolean {
  if (!held) return true;
  const { minIou = 0.3, maxShift = 0.22 } = opts;
  const a = { x: (held.xmin + held.xmax) / 2, y: (held.ymin + held.ymax) / 2 };
  const b = { x: (incoming.xmin + incoming.xmax) / 2, y: (incoming.ymin + incoming.ymax) / 2 };
  const shift = Math.hypot(a.x - b.x, a.y - b.y);
  return shift <= maxShift || iouLocal(held, incoming) >= minIou;
}

function iouLocal(a: Box, b: Box) {
  const ix = Math.max(0, Math.min(a.xmax, b.xmax) - Math.max(a.xmin, b.xmin));
  const iy = Math.max(0, Math.min(a.ymax, b.ymax) - Math.max(a.ymin, b.ymin));
  const inter = ix * iy;
  const areaA = (a.xmax - a.xmin) * (a.ymax - a.ymin);
  const areaB = (b.xmax - b.xmin) * (b.ymax - b.ymin);
  return inter / (areaA + areaB - inter || 1);
}
