import { useCallback, useEffect, useState } from "react";

type Screen =
  | "home"
  | "how"
  | "start"
  | "auth"
  | "hub"
  | "career"
  | "global"
  | "global-firsts"
  | "global-points"
  | "global-places";

interface Player {
  id?: string;
  key?: string;
  name: string;
  games: number;
  points: number;
  firsts: number;
  best: number;
  rarest?: { name: string; players: number } | null;
  visited?: number;
}
interface Place {
  name: string;
  players: number;
  games: number;
}

const STEPS = [
  "Read the riddle. It describes an object, never names it.",
  "Find that object in your room and photograph it.",
  "The judge checks the photo. Three attempts per round.",
  "Faster answers score more.",
  "Highest score wins.",
];

const token = () => localStorage.getItem("escapic.token") ?? "";

async function api<T>(path: string): Promise<T> {
  const res = await fetch(path, {
    headers: { authorization: `Bearer ${token()}` },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`http ${res.status}`);
  return (await res.json()) as T;
}

export function Home({
  onPlay,
  onJoin,
  busy,
  error,
}: {
  onPlay: (name: string) => void;
  onJoin: (code: string, name: string) => void;
  busy: boolean;
  error: string | null;
}) {
  const [screen, setScreen] = useState<Screen>(() =>
    localStorage.getItem("escapic.afterGame") === "1" ? "hub" : "home",
  );
  const [mode, setMode] = useState<"login" | "create">("create");
  const [name, setName] = useState(localStorage.getItem("escapic.name") ?? "");
  const [password, setPassword] = useState("");
  const [location, setLocation] = useState("");
  const [playerId, setPlayerId] = useState(localStorage.getItem("escapic.id") ?? "");
  const [authError, setAuthError] = useState<string | null>(null);

  const [career, setCareer] = useState<Player | null>(null);
  const [board, setBoard] = useState<Player[] | null>(null);
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [showJoin, setShowJoin] = useState(false);

  const message = authError ?? error;

  // Best-effort geolocation: fills the label with coordinates the player can
  // then overwrite with a real place name. No reverse-geocoder, no key.
  useEffect(() => {
    if (!navigator.geolocation) return;
    const id = window.setTimeout(() => {
      navigator.geolocation.getCurrentPosition(
        (p) => {
          const lat = p.coords.latitude;
          const lon = p.coords.longitude;
          void fetch(`/api/geo/reverse?lat=${lat}&lon=${lon}`, {
            signal: AbortSignal.timeout(8000),
          })
            .then((r) => (r.ok ? r.json() : null))
            .then((b: { label?: string } | null) => {
              const label = b?.label?.trim();
              setLocation((prev) => prev || (label ? label : `${lat.toFixed(2)}, ${lon.toFixed(2)}`));
            })
            .catch(() =>
              setLocation((prev) => prev || `${lat.toFixed(2)}, ${lon.toFixed(2)}`),
            );
        },
        () => undefined,
        { timeout: 6000, maximumAge: 600000 },
      );
    }, 600);
    return () => window.clearTimeout(id);
  }, []);

  const loadCareer = useCallback(async () => {
    if (!playerId) return;
    try {
      setCareer(await api<Player>(`/api/stats/personal/${playerId}`));
    } catch {
      setCareer(null);
    }
  }, [playerId]);

  useEffect(() => {
    if (screen !== "career") return;
    void loadCareer();
  }, [screen, loadCareer]);

  useEffect(() => {
    if (screen !== "global-firsts" && screen !== "global-points" && screen !== "global-places") return;
    setBoard(null);
    setPlaces(null);
    void (async () => {
      try {
        if (screen === "global-places") {
          setPlaces((await api<Place[] & { location?: string }[]>("/api/stats/niche")) as unknown as Place[]);
        } else {
          const g = await api<{ topPoints: Player[]; topFirsts: Player[] }>("/api/stats/global");
          setBoard(screen === "global-firsts" ? g.topFirsts : g.topPoints);
        }
      } catch {
        setBoard([]);
        setPlaces([]);
      }
    })();
  }, [screen]);

  const submitAuth = async () => {
    setAuthError(null);
    try {
      const res = await fetch(mode === "create" ? "/api/auth/register" : "/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), password, location: location.trim() }),
        signal: AbortSignal.timeout(15000),
      });
      const body = (await res.json().catch(() => ({}))) as {
        token?: string;
        user?: { id: string; name: string };
        error?: string;
      };
      if (!res.ok || !body.token) throw new Error(body.error ?? "could not sign in");
      localStorage.setItem("escapic.token", body.token);
      localStorage.setItem("escapic.name", body.user?.name ?? name.trim());
      localStorage.setItem("escapic.id", body.user?.id ?? "");
      localStorage.setItem("escapic.location", location.trim());
      setPlayerId(body.user?.id ?? "");
      setPassword("");
      setScreen("hub");
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : "could not sign in");
    }
  };

  const back = (to: Screen) => (
    <button className="mono dim" style={{ background: "none", border: 0, marginBottom: 18 }} onClick={() => setScreen(to)}>
      &lt; Back
    </button>
  );

  if (screen === "home") {
    return (
      <div className="center-wrap">
        <div style={{ maxWidth: 380, width: "100%", textAlign: "center" }}>
          <img
            src="/logo.png"
            alt="EscaPic"
            style={{ width: 220, height: "auto", display: "block", margin: "0 auto 26px" }}
          />
          <h1
            className="title"
            style={{ fontSize: 15, lineHeight: "22px", fontWeight: 500, letterSpacing: 0 }}
          >
            Your room. Your mystery. Your escape.
          </h1>
          <button className="btn" style={{ width: "100%", marginTop: 14 }} onClick={() => setScreen("start")}>
            Get Started
          </button>
          <button className="btn ghost" style={{ width: "100%", marginTop: 8 }} onClick={() => setScreen("how")}>
            How to Play
          </button>
        </div>
      </div>
    );
  }

  if (screen === "how") {
    return (
      <div className="center-wrap">
        <div style={{ maxWidth: 380, width: "100%" }}>
          {back("home")}
          <div className="kicker">How to play</div>
          <h1 className="title" style={{ marginTop: 8 }}>
            Five rounds.
          </h1>
          <ol style={{ margin: "18px 0 0", paddingLeft: 20, listStyle: "decimal", display: "grid", gap: 10 }}>
            {STEPS.map((s) => (
              <li key={s} className="body" style={{ color: "var(--ink)", fontSize: 14, lineHeight: "20px" }}>
                {s}
              </li>
            ))}
          </ol>
          <button className="btn" style={{ width: "100%", marginTop: 26 }} onClick={() => setScreen("start")}>
            I&apos;m ready
          </button>
        </div>
      </div>
    );
  }

  if (screen === "start") {
    return (
      <div className="center-wrap">
        <div style={{ maxWidth: 380, width: "100%" }}>
          {back("home")}
          <div className="kicker">Get started</div>
          <h1 className="title" style={{ marginTop: 8, fontSize: 30, lineHeight: "36px" }}>
            You need an account to keep score.
          </h1>
          <button
            className="btn"
            style={{ width: "100%", marginTop: 24 }}
            onClick={() => {
              setMode("create");
              setScreen("auth");
            }}
          >
            Create Account
          </button>
          <button
            className="btn secondary"
            style={{ width: "100%", marginTop: 10 }}
            onClick={() => {
              setMode("login");
              setScreen("auth");
            }}
          >
            Login
          </button>
        </div>
      </div>
    );
  }

  if (screen === "auth") {
    return (
      <div className="center-wrap">
        <div style={{ maxWidth: 380, width: "100%" }}>
          {back("start")}
          <div className="kicker">{mode === "create" ? "Create account" : "Login"}</div>
          <h1 className="title" style={{ marginTop: 8, fontSize: 28, lineHeight: "34px" }}>
            {mode === "create" ? "Pick a name they'll remember." : "Welcome back."}
          </h1>
          <input
            className="field"
            style={{ marginTop: 20, textAlign: "left", letterSpacing: 1, paddingLeft: 14, textTransform: "none" }}
            placeholder="Name"
            value={name}
            maxLength={12}
            onChange={(e) => setName(e.target.value)}
            autoComplete="username"
          />
          <input
            className="field"
            style={{ marginTop: 10, textAlign: "left", letterSpacing: 1, paddingLeft: 14, textTransform: "none" }}
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "create" ? "new-password" : "current-password"}
          />
          {mode === "create" && location && (
            <p className="mono dim" style={{ marginTop: 10, textAlign: "center" }}>
              location · {location}
            </p>
          )}
          <button
            className="btn"
            style={{ width: "100%", marginTop: 14 }}
            disabled={busy || name.trim().length < 2 || password.length < 4}
            onClick={() => void submitAuth()}
          >
            {busy ? "Working…" : mode === "create" ? "Create account" : "Log in"}
          </button>
          {message && (
            <p className="feedback bad" style={{ marginTop: 10, textAlign: "center" }}>
              {message}
            </p>
          )}
          <p className="mono dim" style={{ marginTop: 14, textAlign: "center", lineHeight: 1.8 }}>
            no email · no password reset · local accounts
          </p>
        </div>
      </div>
    );
  }

  if (screen === "hub") {
    return (
      <div className="center-wrap">
        <div style={{ maxWidth: 380, width: "100%" }}>
          <div className="kicker">Get started</div>
          <h1 className="title" style={{ marginTop: 8, fontSize: 30, lineHeight: "36px" }}>
            Signed in as {name || "player"}.
          </h1>
          <button className="btn" style={{ width: "100%", marginTop: 24 }} onClick={() => onPlay(name.trim() || "Player")}>
            Start a New Game
          </button>
          <button className="btn secondary" style={{ width: "100%", marginTop: 10 }} onClick={() => setScreen("career")}>
            Career Stats
          </button>
          <button className="btn secondary" style={{ width: "100%", marginTop: 10 }} onClick={() => setScreen("global")}>
            Global Stats
          </button>
          {showJoin ? (
            <>
              <input
                className="field"
                style={{ marginTop: 12, letterSpacing: 8, fontSize: 22 }}
                placeholder="CODE"
                value={joinCode}
                maxLength={4}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                autoComplete="off"
              />
              <button
                className="btn"
                style={{ width: "100%", marginTop: 10 }}
                disabled={joinCode.length !== 4}
                onClick={() => onJoin(joinCode, name.trim() || "Player")}
              >
                Enter room
              </button>
            </>
          ) : (
            <button
              className="btn ghost"
              style={{ width: "100%", marginTop: 10 }}
              onClick={() => setShowJoin(true)}
            >
              Join a Game
            </button>
          )}
          {back("home")}
        </div>
      </div>
    );
  }

  if (screen === "career") {
    return (
      <div className="center-wrap">
        <div style={{ maxWidth: 380, width: "100%" }}>
          {back("hub")}
          <div className="kicker">Career stats</div>
          <h1 className="title" style={{ marginTop: 8 }}>
            {name || "Player"}
          </h1>
          <div style={{ marginTop: 20, display: "grid", gap: 8 }}>
            {[
              ["Games played", career?.games ?? 0],
              ["Total points", career?.points ?? 0],
              ["First places", career?.firsts ?? 0],
              ["Most obscure location", career?.rarest ? `${career.rarest.name} (${career.rarest.players})` : "—"],
            ].map(([label, value]) => (
              <div key={String(label)} className="panel" style={{ padding: "12px 14px", display: "flex", justifyContent: "space-between" }}>
                <span className="body" style={{ color: "var(--ink-dim)" }}>{label}</span>
                <span className="mono" style={{ color: "var(--ink)" }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (screen === "global") {
    return (
      <div className="center-wrap">
        <div style={{ maxWidth: 380, width: "100%" }}>
          {back("hub")}
          <div className="kicker">Global stats</div>
          <h1 className="title" style={{ marginTop: 8, fontSize: 30 }}>
            The world, ranked.
          </h1>
          <button className="btn" style={{ width: "100%", marginTop: 22 }} onClick={() => setScreen("global-firsts")}>
            First Place Leaderboard
          </button>
          <button className="btn secondary" style={{ width: "100%", marginTop: 10 }} onClick={() => setScreen("global-points")}>
            Points Leaderboard
          </button>
          <button className="btn secondary" style={{ width: "100%", marginTop: 10 }} onClick={() => setScreen("global-places")}>
            Best Locations
          </button>
        </div>
      </div>
    );
  }

  const isPlaces = screen === "global-places";
  const title =
    screen === "global-firsts" ? "Most first places" : screen === "global-points" ? "Most points ever" : "Rarest rooms";

  return (
    <div className="center-wrap">
      <div style={{ maxWidth: 400, width: "100%" }}>
        {back("global")}
        <div className="kicker">Global stats</div>
        <h1 className="title" style={{ marginTop: 8, fontSize: 28 }}>
          {title}
        </h1>
        <div style={{ marginTop: 18, display: "grid", gap: 8 }}>
          {isPlaces
            ? places?.map((p, i) => {
                const row = p as unknown as { key: string; name: string; location: string; players: number };
                return (
                  <div key={row.key} className="panel" style={{ padding: "10px 14px", display: "flex", gap: 12, alignItems: "center" }}>
                    <span className="mono" style={{ color: i === 0 ? "var(--gold)" : "var(--ink-faint)", width: 18 }}>
                      {i + 1}
                    </span>
                    <span style={{ flex: 1 }}>
                      <span className="body" style={{ color: "var(--ink)", display: "block" }}>{row.name}</span>
                      <span className="mono dim">{row.location}</span>
                    </span>
                    <span className="mono dim">{row.players === 1 ? "unique" : `${row.players} at it`}</span>
                  </div>
                );
              })
            : board?.slice(0, 10).map((p, i) => (
                <div key={p.key} className="panel" style={{ padding: "10px 14px", display: "flex", gap: 12, alignItems: "center" }}>
                  <span className="mono" style={{ color: i === 0 ? "var(--gold)" : "var(--ink-faint)", width: 18 }}>
                    {i + 1}
                  </span>
                  <span className="body" style={{ flex: 1, color: "var(--ink)" }}>{p.name}</span>
                  <span className="mono" style={{ color: "var(--ink)" }}>
                    {screen === "global-firsts" ? p.firsts : p.points}
                  </span>
                </div>
              ))}
          {(isPlaces ? places : board) === null && <p className="mono dim">Loading…</p>}
          {(isPlaces ? places : board)?.length === 0 && <p className="mono dim">Nobody yet.</p>}
        </div>
      </div>
    </div>
  );
}
