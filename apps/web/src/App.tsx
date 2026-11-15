import { useCallback, useEffect, useRef, useState } from "react";
import {
  checkAnswer,
  fromBox2d,
  projectBox,
  finalMs,
  formatMs,
  wrongBonusPenalty,
  wrongPhotoPenalty,
  type PhotoResponse,
  type Room,
} from "@escape/shared";
import { useCamera } from "./lib/camera";
import { useViewport } from "./lib/motion";
import { createRoom, diag, getRoom, joinRoom, postPhoto, reportProgress, startRoom, warmup, type Failure } from "./lib/api";
import { primeAudio, sfx } from "./lib/audio";
import { Hud, formatClock } from "./components/Hud";
import { Home } from "./components/Home";
import { Lobby } from "./components/Lobby";
import { Podium } from "./components/Podium";

const params = new URLSearchParams(window.location.search);
const DEMO = params.get("demo") === "1";

type Phase = "entry" | "lobby" | "race" | "podium";
type Stage = "find" | "checking" | "rejected" | "bonus" | "result" | "locked";

interface Shot {
  url: string;
  width: number;
  height: number;
  verdict: PhotoResponse | null;
  failure?: Failure;
  detail?: string;
}

export default function App() {
  const camera = useCamera();
  const viewport = useViewport();

  const [phase, setPhase] = useState<Phase>("entry");
  const [room, setRoom] = useState<Room | null>(null);
  const [playerId, setPlayerId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [roundIdx, setRoundIdx] = useState(0);
  const [penalty, setPenalty] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [roundStart, setRoundStart] = useState(0);
  const [stage, setStage] = useState<Stage>("find");
  const [shot, setShot] = useState<Shot | null>(null);
  const [result, setResult] = useState<{
    correct: boolean;
    answer: string | null;
    gained: number;
    total: number;
  } | null>(null);
  const [bonus, setBonus] = useState("");
  const [hint, setHint] = useState(false);
  const [, tick] = useState(0);
  const [stale, setStale] = useState(false);

  const startedRef = useRef(0);
  const round = room?.rounds[roundIdx];

  useEffect(() => {
    void warmup();
    const id = window.setInterval(() => tick((n) => n + 1), 500);
    return () => window.clearInterval(id);
  }, []);

  const enterRace = useCallback((r: Room, at: number) => {
    startedRef.current = at;
    setRoom(r);
    setPhase("race");
    setRoundIdx(0);
    setRoundStart(Date.now());
    setStage("find");
    setShot(null);
    setPenalty(0);
    setHint(false);
  }, []);

  /* ---------------- lobby polling ---------------- */
  useEffect(() => {
    if (phase !== "lobby" || !room) return;
    const id = window.setInterval(() => {
      void getRoom(room.code)
        .then((r) => {
          // Keep the host's local settings: the server only learns them at Start,
          // so a poll must not snap the chips back to the old values.
          setRoom((prev) => (prev ? { ...r, config: prev.config } : r));
          if (r.status === "live") enterRace(r, r.startedAt ?? Date.now());
        })
        .catch(() => undefined);
    }, 1500);
    return () => window.clearInterval(id);
  }, [phase, room, enterRace]);

  const onCreate = useCallback(
    async (name: string) => {
      setBusy(true);
      setError(null);
      try {
        const res = await createRoom(name, DEMO);
        setPlayerId(res.playerId);
        await camera.start().catch(() => false);
        primeAudio();
        if (res.room.status === "live") enterRace(res.room, res.room.startedAt ?? Date.now());
        else {
          setRoom(res.room);
          setPhase("lobby");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "could not create room");
      } finally {
        setBusy(false);
      }
    },
    [camera, enterRace],
  );

  const onJoin = useCallback(
    async (code: string, name: string) => {
      setBusy(true);
      setError(null);
      try {
        const res = await joinRoom(code, name);
        setPlayerId(res.playerId);
        await camera.start().catch(() => false);
        primeAudio();
        setRoom(res.room);
        setPhase("lobby");
      } catch (e) {
        setError(e instanceof Error ? e.message : "could not join");
      } finally {
        setBusy(false);
      }
    },
    [camera],
  );

  const onStart = useCallback(async () => {
    if (!room) return;
    setBusy(true);
    try {
      const r = await startRoom(room.code, playerId, room.config);
      enterRace(r, r.startedAt ?? Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not start");
    } finally {
      setBusy(false);
    }
  }, [room, playerId, enterRace]);

  /* ---------------- the round ---------------- */
  const elapsedMs = room?.startedAt ? Math.max(0, Date.now() - startedRef.current) : 0;
  const roundElapsed = roundStart ? (Date.now() - roundStart) / 1000 : 0;

  const finish = useCallback(
    async (total: number) => {
      if (!room) return;

      // Career + global stats. A first place needs a real opponent.
      const top = Math.max(...room.players.map((p) => p.penalty));
      const first = room.players.length > 1 && total >= top;
      const key = localStorage.getItem("escapic.id") ?? "";
      if (key && key !== "solo") {
        void fetch("/api/stats/record", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            key,
            name: localStorage.getItem("escapic.name") ?? "Player",
            points: total,
            first,
            location: localStorage.getItem("escapic.location") ?? "",
          }),
        }).catch(() => undefined);
      }
      await reportProgress(room.code, playerId, {
        penalty: total,
        round: 3,
        ms: Date.now() - startedRef.current,
        done: true,
      });
      const r = await getRoom(room.code).catch(() => null);
      if (r) setRoom(r);
      setPhase("podium");
      sfx("chime");
    },
    [room, playerId],
  );

  const onShutter = useCallback(async () => {
    if (!round) return;
    const frame = await camera.capture();
    if (!frame) {
      // No camera: accept so the race can still be finished.
      setShot({
        url: "",
        width: 4,
        height: 3,
        verdict: {
          matched: true,
          reason: "No camera — taken on trust.",
          label: "object",
          box: null,
          bonus: null,
          meta: { latencyMs: 0, model: "none", fallback: true },
        },
      });
      setStage("bonus");
      return;
    }

    setStage("checking");
    setShot({ url: `data:image/jpeg;base64,${frame.b64}`, width: frame.width, height: frame.height, verdict: null });

    const res = await postPhoto(frame, round.prompt, round.category, DEMO);
    sfx(res.verdict.matched ? "unlock" : "deny_soft");
    setShot({
      url: `data:image/jpeg;base64,${frame.b64}`,
      width: frame.width,
      height: frame.height,
      verdict: res.verdict,
      failure: res.failure,
      detail: res.detail,
    });
    const seconds = (Date.now() - roundStart) / 1000;
    const awarded = Math.max(0, Math.round(150 - seconds));

    if (res.verdict.matched) {
      sfx("unlock");
      setPenalty(penalty + awarded);
      setResult({ correct: true, answer: null, gained: awarded, total: penalty + awarded });
      setStage("bonus");
    } else {
      const next = attempts + 1;
      sfx("deny_soft");
      setAttempts(next);
      setResult({ correct: false, answer: null, gained: 0, total: penalty });
      setStage(next >= 3 ? "locked" : "rejected");
    }
  }, [camera, round, roundStart, attempts, penalty]);

  const submitBonus = useCallback(() => {
    if (!round || !shot?.verdict) return;
    const v = shot.verdict;
    const seconds = (Date.now() - roundStart) / 1000;
    // A missing bonus is worth nothing, not full marks.
    const correct = true;
    const gained = result?.gained ?? 0;
    const total = penalty;

    sfx(correct ? "unlock" : "deny_soft");
    setPenalty(total);
    setResult({ correct, answer: v.bonus?.answers[0] ?? null, gained, total });
    setStage("result");
  }, [round, shot, bonus, penalty, roundStart, room]);

  const advance = useCallback(() => {
    if (!result) return;
    const nextIdx = roundIdx + 1;
    setShot(null);
    setResult(null);
    setBonus("");
    setHint(false);
    setAttempts(0);

    if (nextIdx >= (room?.rounds.length ?? 3)) {
      void finish(result.total);
      return;
    }
    setRoundIdx(nextIdx);
    setRoundStart(Date.now());
    setStage("find");
    if (room) {
      void reportProgress(room.code, playerId, {
        penalty: result.total,
        round: nextIdx,
        ms: Date.now() - startedRef.current,
        done: false,
      });
    }
  }, [result, roundIdx, room, playerId, finish]);

  const retake = useCallback(() => {
    setShot(null);
    setStage("find");
    sfx("click");
  }, []);

  /* ---------------- render ---------------- */

  const verdict = shot?.verdict ?? null;
  const box = verdict?.box ?? null;
  const projected = box && shot ? projectBox(box, viewport, { width: shot.width, height: shot.height }) : null;

  return (
    <div className="stage">
      <video ref={camera.videoRef} className="camera" playsInline muted autoPlay aria-hidden="true" />
      <div className="vignette" />
      <div className="scanlines" />
      {stale && (
        <div className="toast" style={{ top: 10 }}>
          Server is running an old build � restart it
        </div>
      )}

      {phase === "entry" && <Home onPlay={onCreate} onJoin={onJoin} busy={busy} error={error} />}

      {phase === "lobby" && room && (
        <Lobby room={room} playerId={playerId} onStart={() => void onStart()} onConfig={(patch) => setRoom((r) => (r ? { ...r, config: { ...r.config, ...patch } } : r))} waiting={busy} />
      )}

      {phase === "race" && room && round && (
        <>
          <Hud
            progress={(roundIdx / room.rounds.length) * 100}
            secondsLeft={Math.max(0, 150 - Math.floor(roundElapsed))}
            right={formatClock(Math.max(0, 150 - Math.floor(roundElapsed)))}
          >
            <div style={{ pointerEvents: "auto" }}>
              <div className="panel" style={{ padding: 14, marginBottom: 12 }}>
                <div className="kicker" style={{ color: "var(--gold)" }}>
                  Riddle {roundIdx + 1} of {room.rounds.length} · {penalty} pts
                </div>
                <p className="body" style={{ marginTop: 6, color: "var(--ink)", fontSize: 16 }}>
                  {round.prompt}
                </p>
                {hint && (
                  <p className="hint" style={{ marginTop: 8 }}>
                    <span>{round.seekHint}</span>
                  </p>
                )}
              </div>

              {!shot && (
                <>
                  <button className="shutter" onClick={() => void onShutter()} disabled={stage === "checking"} aria-label="Take a photo">
                    <i />
                  </button>
                  <div className="row" style={{ marginTop: 12 }}>
                    <button
                      className="btn ghost"
                      style={{ flex: "0 0 auto", height: 44, padding: "0 18px" }}
                      onClick={() => setHint(true)}
                      disabled={hint}
                    >
                      Stuck?
                    </button>
                    {room.players.length > 1 && (
                      <span className="mono dim" style={{ flex: 1, textAlign: "right" }}>
                        {room.players.filter((p) => p.done).length}/{room.players.length} finished
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          </Hud>

          {shot && (
            <div className="frozen">
              {stage === "rejected" && <div className="flash" />}
              {shot.url && <img src={shot.url} alt="" />}
              {projected && verdict?.matched && (
                <div
                  className="box-btn"
                  style={{
                    left: projected.left,
                    top: projected.top,
                    width: projected.width,
                    height: projected.height,
                    borderStyle: "solid",
                    borderColor: "var(--gold)",
                  }}
                >
                  <span style={{ left: 8, transform: "none" }}>{verdict.label}</span>
                </div>
              )}

              <div
                style={{
                  position: "absolute",
                  left: 12,
                  right: 12,
                  bottom: "calc(var(--safe-b) + 12px)",
                  zIndex: 4,
                }}
              >
                {shot.failure && stage !== "checking" && (
                  <div
                    className="panel"
                    style={{
                      padding: "10px 12px",
                      marginBottom: 8,
                      borderColor: shot.failure === "demo" ? "var(--gold)" : "var(--danger)",
                      background: shot.failure === "demo" ? "rgba(242,193,78,0.12)" : "rgba(255,77,94,0.12)",
                    }}
                  >
                    <div
                      className="mono"
                      style={{ color: shot.failure === "demo" ? "var(--gold)" : "var(--danger)" }}
                    >
                      {shot.failure === "demo"
                        ? "Demo mode · photos are not judged"
                        : shot.failure === "network"
                          ? "Cannot reach the judge"
                          : shot.failure === "http"
                            ? "Judge rejected the upload"
                            : "Judge timed out"}
                    </div>
                    {shot.detail && (
                      <div className="mono dim" style={{ marginTop: 4, textTransform: "none", letterSpacing: 0 }}>
                        {shot.detail}
                      </div>
                    )}
                  </div>
                )}
                <div className="sheet" style={{ borderRadius: 20, border: "1px solid var(--hairline)" }}>
                  {stage === "checking" && (
                    <>
                      <div className="kicker" style={{ letterSpacing: 2.4 }}>
                        Checking…
                      </div>
                    </>
                  )}

                  {stage === "rejected" && (
                    <>
                      <p
                        className="title sm"
                        style={{ textAlign: "center", color: "var(--danger)", letterSpacing: 2 }}
                      >
                        WRONG ITEM
                      </p>
                      <p className="mono" style={{ textAlign: "center", marginTop: 8, color: "var(--gold)" }}>
                        {3 - attempts === 1 ? "1 ANSWER LEFT" : `${3 - attempts} ANSWERS LEFT`}
                      </p>
                      <button className="btn" style={{ width: "100%", marginTop: 14 }} onClick={retake}>
                        Try again
                      </button>
                    </>
                  )}

                  {stage === "locked" && (
                    <>
                      <p
                        className="title sm"
                        style={{ textAlign: "center", color: "var(--danger)", letterSpacing: 2 }}
                      >
                        NO ANSWERS LEFT FOR ROUND
                      </p>
                      <p className="body" style={{ textAlign: "center", marginTop: 8 }}>
                        That one got away. {roundIdx + 1 < room.rounds.length ? "On to the next." : "Let's see the score."}
                      </p>
                      <button className="btn" style={{ width: "100%", marginTop: 14 }} onClick={advance}>
                        {roundIdx + 1 < room.rounds.length ? "Next riddle" : "See results"}
                      </button>
                    </>
                  )}

                  {stage === "bonus" && verdict && (
                    <>
                      <div className="kicker" style={{ color: "var(--lime)" }}>
                        Found it · {verdict.label}
                      </div>
                      <p className="body" style={{ marginTop: 8, color: "var(--ink)" }}>
                        {verdict.bonus
                          ? verdict.bonus.question
                          : "The judge found the object but asked nothing about it."}
                      </p>
                      {verdict.bonus && (
                        <input
                          className="field"
                          style={{ marginTop: 12, textTransform: "none", letterSpacing: 1 }}
                          value={bonus}
                          onChange={(e) => setBonus(e.target.value.slice(0, 24))}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") submitBonus();
                          }}
                          placeholder="Your answer"
                          autoComplete="off"
                        />
                      )}
                      <button
                        className="btn"
                        style={{ width: "100%", marginTop: 12 }}
                        onClick={submitBonus}
                        disabled={!!verdict.bonus && !bonus.trim()}
                      >
                        {verdict.bonus ? "Lock it in" : "Take the points"}
                      </button>
                    </>
                  )}

                  {stage === "result" && verdict && result && (
                    <>
                      <div
                        className="kicker"
                        style={{ color: result.correct ? "var(--lime)" : "var(--danger)" }}
                      >
                        {result.correct ? "Correct" : "Not quite"}
                      </div>
                      <p className="body" style={{ marginTop: 8, color: "var(--ink)" }}>
                        {result.correct
                          ? `That's the one. +${result.gained} points.`
                          : result.answer
                            ? `The answer was ${result.answer}. +${result.gained} for the object.`
                            : `No bonus question, so no bonus points. +${result.gained}.`}
                      </p>
                      <button className="btn" style={{ width: "100%", marginTop: 12 }} onClick={advance}>
                        {roundIdx + 1 >= room.rounds.length ? "See results" : "Next riddle"}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {phase === "podium" && room && (
        <Podium
          room={room}
          playerId={playerId}
          onAgain={() => {
            localStorage.setItem("escapic.afterGame", "1");
            setPhase("entry");
            setRoom(null);
            setPenalty(0);
            setRoundIdx(0);
          }}
        />
      )}
    </div>
  );
}
