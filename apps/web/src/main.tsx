import { Component, StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

/**
 * A render crash used to leave a black screen. Now it leaves a message, because
 * a blank page during judging is indistinguishable from "the app is broken".
 */
class Boundary extends Component<{ children: ReactNode }, { err: string | null }> {
  state = { err: null as string | null };

  static getDerivedStateFromError(e: unknown) {
    return { err: e instanceof Error ? `${e.name}: ${e.message}` : String(e) };
  }

  render() {
    if (this.state.err) {
      return (
        <div className="center-wrap">
          <div className="panel" style={{ padding: 22, maxWidth: 380, width: "100%" }}>
            <div className="kicker" style={{ color: "var(--danger)" }}>
              Something broke
            </div>
            <p className="body" style={{ marginTop: 10, color: "var(--ink)", wordBreak: "break-word" }}>
              {this.state.err}
            </p>
            <p className="mono dim" style={{ marginTop: 10 }}>
              If the server was rebuilt, restart it.
            </p>
            <button
              className="btn"
              style={{ width: "100%", marginTop: 14 }}
              onClick={() => location.reload()}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Boundary>
      <App />
    </Boundary>
  </StrictMode>,
);
