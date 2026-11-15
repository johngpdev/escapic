import { useState } from "react";
import type { Room, RoomConfig } from "@escape/shared";

export function Entry({
  onCreate,
  onJoin,
  busy,
  error,
}: {
  onCreate: (name: string) => void;
  onJoin: (code: string, name: string) => void;
  busy: boolean;
  error: string | null;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);
  const ready = name.trim().length > 0;

  return (
    <div className="center-wrap">
      <div style={{ maxWidth: 380, width: "100%" }}>
        <div className="logo" style={{ justifyContent: "center", marginBottom: 22 }}>
          <span className="logo-mark" />
          EscaPic
        </div>
        <h1 className="title" style={{ textAlign: "center", fontSize: 34, lineHeight: "40px" }}>
          Race a room.
        </h1>
        <p className="body" style={{ textAlign: "center", marginTop: 10 }}>
          Find the object, photograph it, answer the question. Fastest time wins.
        </p>

        <input
          className="field"
          style={{ marginTop: 22, textAlign: "left", letterSpacing: 1, paddingLeft: 14, textTransform: "none" }}
          placeholder="Your name"
          value={name}
          maxLength={12}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
        />

        {!joining ? (
          <>
            <button className="btn" style={{ width: "100%", marginTop: 12 }} disabled={!ready || busy} onClick={() => onCreate(name.trim())}>
              {busy ? "Writing riddles…" : "Create a room"}
            </button>
            <button className="btn ghost" style={{ width: "100%", marginTop: 8 }} disabled={!ready} onClick={() => setJoining(true)}>
              Join with a code
            </button>
          </>
        ) : (
          <>
            <input
              className="field"
              style={{ marginTop: 12, letterSpacing: 8, fontSize: 22 }}
              placeholder="CODE"
              value={code}
              maxLength={4}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              autoComplete="off"
            />
            <button className="btn" style={{ width: "100%", marginTop: 10 }} disabled={code.length !== 4 || !ready || busy} onClick={() => onJoin(code, name.trim())}>
              {busy ? "Joining…" : "Join room"}
            </button>
            <button className="btn ghost" style={{ width: "100%", marginTop: 8 }} onClick={() => setJoining(false)}>
              Back
            </button>
          </>
        )}

        {error && (
          <p className="feedback bad" style={{ textAlign: "center", marginTop: 12 }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

const DIFFICULTIES: RoomConfig["difficulty"][] = ["EASY", "MEDIUM", "HARD", "EXTREME", "IMPOSSIBLE"];
const COUNTS = [5, 8, 10];
const LIMITS = [5, 10, 15];

export function Lobby({
  room,
  playerId,
  onStart,
  onConfig,
  waiting,
}: {
  room: Room;
  playerId: string;
  onStart: () => void;
  onConfig: (patch: Partial<RoomConfig>) => void;
  waiting: boolean;
}) {
  const isHost = room.hostId === playerId;
  const c = room.config;

  return (
    <div className="center-wrap">
      <div style={{ maxWidth: 380, width: "100%" }}>
        <div className="kicker">Room code</div>
        <div style={{ fontFamily: "var(--mono)", fontSize: 56, letterSpacing: 12, margin: "4px 0 6px" }}>
          {room.code === "SOLO" ? "SOLO" : room.code}
        </div>
        {room.code === "SOLO" && (
          <p className="mono" style={{ color: "var(--danger)" }}>
            Server unreachable · playing solo, nothing is saved
          </p>
        )}
        <p className="body" style={{ fontSize: 13 }}>
          Everyone enters this code. The race starts together.
        </p>

        <div className="mono dim" style={{ marginTop: 18, marginBottom: 8 }}>
          In the room · {room.players.length}/8
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {room.players.map((p) => (
            <span key={p.id} className="pill" style={{ color: p.id === playerId ? "var(--gold)" : undefined }}>
              {p.name}
              {p.id === room.hostId ? " · host" : ""}
            </span>
          ))}
        </div>

        {isHost ? (
          <div style={{ marginTop: 20, display: "grid", gap: 14 }}>
            <div>
              <div className="mono dim" style={{ marginBottom: 6 }}>Difficulty</div>
              <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
                {DIFFICULTIES.map((d) => (
                  <button
                    key={d}
                    className="chip"
                    aria-pressed={c.difficulty === d}
                    style={{ flex: "1 1 28%", minWidth: 92, height: 40, fontSize: 11, letterSpacing: 0.8 }}
                    onClick={() => onConfig({ difficulty: d })}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="mono dim" style={{ marginBottom: 6 }}>Where are you playing?</div>
              <div className="row" style={{ gap: 8 }}>
                {(["HOME", "OUTDOORS"] as const).map((v) => (
                  <button
                    key={v}
                    className="chip"
                    aria-pressed={c.venue === v}
                    style={{ flex: 1, height: 40, fontSize: 12 }}
                    onClick={() => onConfig({ venue: v })}
                  >
                    {v === "HOME" ? "At home" : "Outdoors"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="mono dim" style={{ marginBottom: 6 }}>Riddles</div>
              <div className="row" style={{ gap: 8 }}>
                {COUNTS.map((n) => (
                  <button key={n} className="chip" aria-pressed={c.rounds === n} style={{ flex: 1, height: 40 }} onClick={() => onConfig({ rounds: n })}>
                    {n} riddles
                  </button>
                ))}
              </div>
            </div>
            <button className="btn" style={{ width: "100%", marginTop: 4 }} onClick={onStart}>
              Start the race
            </button>
            <p className="mono dim" style={{ textAlign: "center", fontSize: 8 }}>
              changing settings after someone joins starts a new set of riddles
            </p>
          </div>
        ) : (
          <>
            <div className="mono dim" style={{ marginTop: 20, lineHeight: 2 }}>
              {c.rounds} riddles · {c.limitMin} min · {c.difficulty}
            </div>
            <p className="mono dim" style={{ textAlign: "center", marginTop: 24, animation: waiting ? "blink 1.2s steps(2,end) infinite" : undefined }}>
              Waiting for the host…
            </p>
          </>
        )}
      </div>
    </div>
  );
}
