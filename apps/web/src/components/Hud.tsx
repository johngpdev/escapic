import { useEffect, useState } from "react";

export function useElapsed(startedAt: number | null, running: boolean): number {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!running || !startedAt) return;
    const id = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [running, startedAt]);
  if (!startedAt) return 0;
  return Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

interface HudProps {
  progress: number;
  secondsLeft: number;
  right?: string;
  children?: React.ReactNode;
}

export function Hud({ progress, secondsLeft, right, children }: HudProps) {
  const low = secondsLeft <= 60;
  return (
    <div className="hud">
      <div>
        <div className="hud-top">
          <div className="logo">
            <span className="logo-mark" />
            EscaPic
          </div>
          <div className={low ? "timer low" : "timer"}>
            {right ?? formatClock(secondsLeft)}
          </div>
        </div>
        <div className="progress">
          <i style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
        </div>
      </div>
      {children}
    </div>
  );
}
