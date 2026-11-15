import { useEffect, useRef, useState } from "react";

/**
 * Hologram tilt.
 *
 * We do NOT track 3D position — we only steal the phone's rotation to add a
 * few degrees of parallax to the overlay. It costs nothing, never drifts, and
 * cannot break, because there is no state to break.
 *
 * iOS 13+ requires DeviceOrientationEvent.requestPermission() from a user
 * gesture. Call `requestMotionPermission()` from the same tap that starts the
 * camera, or this silently never fires.
 */

type PermissionCtor = {
  requestPermission?: () => Promise<"granted" | "denied">;
};

export async function requestMotionPermission(): Promise<boolean> {
  const D = (window as unknown as { DeviceOrientationEvent?: PermissionCtor })
    .DeviceOrientationEvent;
  try {
    if (D && typeof D.requestPermission === "function") {
      return (await D.requestPermission()) === "granted";
    }
    return typeof window.DeviceOrientationEvent !== "undefined";
  } catch {
    return false;
  }
}

export function useTilt(enabled: boolean) {
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const base = useRef<{ beta: number; gamma: number } | null>(null);
  const smooth = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!enabled) return;
    let raf = 0;

    const onOrient = (e: DeviceOrientationEvent) => {
      const beta = e.beta ?? 0;
      const gamma = e.gamma ?? 0;
      if (!base.current) base.current = { beta, gamma };

      const db = beta - base.current.beta;
      const dg = gamma - base.current.gamma;

      // clamp + low-pass
      const tx = Math.max(-6, Math.min(6, -dg * 0.25));
      const ty = Math.max(-6, Math.min(6, db * 0.25));
      smooth.current.x += (tx - smooth.current.x) * 0.12;
      smooth.current.y += (ty - smooth.current.y) * 0.12;

      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setTilt({ x: smooth.current.x, y: smooth.current.y });
      });
    };

    window.addEventListener("deviceorientation", onOrient, true);
    return () => {
      window.removeEventListener("deviceorientation", onOrient, true);
      cancelAnimationFrame(raf);
    };
  }, [enabled]);

  return tilt;
}

/** Viewport size of the stage (not the window — they differ inside the bezel). */
export function useViewport() {
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });

  useEffect(() => {
    const el = document.querySelector(".stage") as HTMLElement | null;
    if (!el) return;
    const measure = () =>
      setSize((prev) => {
        const next = { width: el.clientWidth, height: el.clientHeight };
        return prev.width === next.width && prev.height === next.height ? prev : next;
      });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("orientationchange", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("orientationchange", measure);
    };
  }, []);

  return size;
}
