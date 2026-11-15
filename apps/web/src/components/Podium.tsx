import { useEffect, useState } from "react";
import type { Room } from "@escape/shared";

const medal = (i: number) => (i === 0 ? "①" : i === 1 ? "②" : i === 2 ? "③" : "·");

export function Podium({
  room,
  playerId,
  onAgain,
}: {
  room: Room;
  playerId: string;
  onAgain: () => void;
}) {
  const [live, setLive] = useState<Room>(room);

  // Keep watching until everyone has finished, so early finishers see the
  // rest of the field land and the ranking settle.
  useEffect(() => {
    if (room.code === "SOLO") return;
    if (live.players.every((p) => p.done)) return;
    const id = window.setInterval(() => {
      void fetch(`/api/room/${room.code}`, { signal: AbortSignal.timeout(6000) })
        .then((r) => (r.ok ? r.json() : null))
        .then((r: Room | null) => {
          if (r?.players) setLive(r);
        })
        .catch(() => undefined);
    }, 1500);
    return () => window.clearInterval(id);
  }, [room.code, live.players]);

  const ranked = [...live.players].sort((a, b) =>
    a.done !== b.done ? (a.done ? -1 : 1) : b.penalty - a.penalty,
  );
  const me = ranked.findIndex((p) => p.id === playerId);
  const pending = live.players.filter((p) => !p.done).length;

  return (
    <div className="center-wrap">
      <div style={{ maxWidth: 400, width: "100%" }}>
        <div className="kicker" style={{ color: "var(--lime)" }}>
          Race over
        </div>
        <h1 className="title" style={{ marginTop: 6 }}>
          {me <= 0 ? "You got out first." : `You finished ${me + 1}${me === 1 ? "nd" : me === 2 ? "rd" : "th"}.`}
        </h1>

        <div style={{ marginTop: 20, display: "grid", gap: 8 }}>
          {ranked.map((p, i) => (
            <div
              key={p.id}
              className="panel"
              style={{
                padding: "10px 14px",
                display: "flex",
                alignItems: "center",
                gap: 12,
                borderColor: p.id === playerId ? "var(--gold)" : undefined,
              }}
            >
              <span className="mono" style={{ color: i === 0 ? "var(--gold)" : "var(--ink-faint)", width: 18 }}>
                {medal(i)}
              </span>
              <span className="body" style={{ flex: 1, color: "var(--ink)", fontSize: 15 }}>
                {p.name}
              </span>
              {p.done && (
                <span className="mono" style={{ color: "var(--ink)", width: 72, textAlign: "right" }}>
                  {p.penalty} pts
                </span>
              )}
              {!p.done && (
                <span className="mono dim" style={{ width: 72, textAlign: "right" }}>
                  finishing rounds
                </span>
              )}
            </div>
          ))}
        </div>

        <div className="mono dim" style={{ textAlign: "center", marginTop: 16 }}>
          room {room.code} · {room.config.rounds} riddles · {room.config.difficulty}
        </div>

        <button className="btn ghost" style={{ width: "100%", marginTop: 18 }} onClick={onAgain}>
          Leave
        </button>
      </div>
    </div>
  );
}
