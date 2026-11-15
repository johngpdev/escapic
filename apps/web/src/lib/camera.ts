import { useCallback, useEffect, useRef, useState } from "react";

export type CamStatus = "idle" | "starting" | "ready" | "denied" | "error";

export interface Frame {
  /** base64 JPEG, no data: prefix */
  b64: string;
  width: number;
  height: number;
}

/**
 * Camera lifecycle.
 *
 * iOS notes baked in here:
 *  - getUserMedia needs `playsinline` + `muted` + `autoplay` or the video is black.
 *  - You must call start() synchronously from a real tap handler. Chaining a
 *    permission prompt after several awaits can drop the user gesture.
 *  - `torch` is not available; exposure/focus constraints are best-effort.
 */
export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CamStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [videoSize, setVideoSize] = useState({ width: 0, height: 0 });

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus("idle");
  }, []);

  const start = useCallback(async () => {
    if (streamRef.current) return true;
    setStatus("starting");
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) throw new Error("no video element");
      video.srcObject = stream;
      await video.play().catch(() => undefined);

      // Best-effort: continuous autofocus/exposure keeps glare from killing us.
      const track = stream.getVideoTracks()[0];
      try {
        await track?.applyConstraints({
          advanced: [{ focusMode: "continuous", exposureMode: "continuous" } as never],
        });
      } catch {
        /* unsupported on iOS Safari — harmless */
      }

      await new Promise<void>((resolve) => {
        if (video.videoWidth > 0) return resolve();
        const done = () => resolve();
        video.addEventListener("loadedmetadata", done, { once: true });
        setTimeout(done, 2500);
      });

      setVideoSize({ width: video.videoWidth || 720, height: video.videoHeight || 1280 });
      setStatus("ready");
      return true;
    } catch (e) {
      const err = e as DOMException;
      const denied = err?.name === "NotAllowedError" || err?.name === "SecurityError";
      setStatus(denied ? "denied" : "error");
      setError(err?.message ?? "camera unavailable");
      return false;
    }
  }, []);

  useEffect(() => () => stop(), [stop]);

  /**
   * Grab one frame, downscaled to `maxEdge` and JPEG-compressed.
   * 768px @ q0.62 is ~60-90KB — small enough to upload on venue wifi in <400ms,
   * big enough that Gemini still grounds objects accurately.
   */
  const capture = useCallback(
    async (maxEdge = 768, quality = 0.62): Promise<Frame | null> => {
      const video = videoRef.current;
      if (!video || !video.videoWidth) return null;

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const scale = Math.min(1, maxEdge / Math.max(vw, vh));
      const w = Math.round(vw * scale);
      const h = Math.round(vh * scale);

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;

      // Cheap pre-processing for dim rooms and window glare.
      ctx.filter = "brightness(1.12) contrast(1.14) saturate(1.05)";
      ctx.drawImage(video, 0, 0, w, h);

      const url = canvas.toDataURL("image/jpeg", quality);
      const b64 = url.slice(url.indexOf(",") + 1);
      return { b64, width: w, height: h };
    },
    [],
  );

  return { videoRef, start, stop, capture, status, error, videoSize };
}
