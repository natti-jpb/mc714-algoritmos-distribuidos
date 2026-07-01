import { useState } from "react";
import { useObserver } from "./useObserver";
import { NodeGraph } from "./components/NodeGraph";
import { Controls } from "./components/Controls";
import { EventLog } from "./components/EventLog";
import { SpaceTime } from "./components/SpaceTime";
import { Explain } from "./components/Explain";
import { TYPE_COLORS, TYPE_LABELS } from "./theme";
import type { MessageType } from "../shared/types";

const LEGEND: MessageType[] = ["APP", "MUTEX_REQUEST", "MUTEX_GRANT", "MUTEX_RELEASE", "ELECTION", "ANSWER", "COORDINATOR"];

export function App() {
  const { connected, nodes, events, send } = useObserver();
  const [showHeartbeats, setShowHeartbeats] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [sideTab, setSideTab] = useState<"controles" | "explicacao">("controles");
  const [bottomTab, setBottomTab] = useState<"log" | "spacetime">("log");

  return (
    <div className="app">
      <header className="topbar">
        <div className="title">
          <h1>MC714 · Algoritmos Distribuídos</h1>
          <span className="subtitle">Lamport · Exclusão mútua centralizada · Eleição Bully</span>
        </div>
        <div className="topbar-right">
          <span className={`conn ${connected ? "on" : "off"}`}>{connected ? "● conectado" : "○ desconectado"}</span>
          <label className="checkbox">
            <input type="checkbox" checked={showHeartbeats} onChange={(e) => setShowHeartbeats(e.target.checked)} />
            heartbeats
          </label>
          <label className="speed">
            velocidade
            <input type="range" min={0.4} max={2} step={0.1} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} />
          </label>
        </div>
      </header>

      <div className="legend">
        {LEGEND.map((t) => (
          <span className="chip" key={t}>
            <span className="dot" style={{ background: TYPE_COLORS[t] }} />
            {TYPE_LABELS[t]}
          </span>
        ))}
        <span className="chip muted">👑 coordenador · 💀 crash · ⏱ relógio de Lamport</span>
      </div>

      <main className="main">
        <section className="graph-panel">
          {nodes.length === 0 ? (
            <div className="waiting">Aguardando o cluster… rode <code>npm run dev:cluster</code> e recarregue.</div>
          ) : (
            <NodeGraph nodes={nodes} events={events} showHeartbeats={showHeartbeats} speed={speed} />
          )}
        </section>

        <aside className="side-panel">
          <div className="tabs">
            <button className={`tab ${sideTab === "controles" ? "active" : ""}`} onClick={() => setSideTab("controles")}>
              Controles
            </button>
            <button className={`tab ${sideTab === "explicacao" ? "active" : ""}`} onClick={() => setSideTab("explicacao")}>
              Explicação
            </button>
          </div>
          <div className="tab-body">
            {sideTab === "controles" ? <Controls nodes={nodes} send={send} /> : <Explain />}
          </div>
        </aside>
      </main>

      <section className="bottom-panel">
        <div className="tabs">
          <button className={`tab ${bottomTab === "log" ? "active" : ""}`} onClick={() => setBottomTab("log")}>
            Log de eventos
          </button>
          <button className={`tab ${bottomTab === "spacetime" ? "active" : ""}`} onClick={() => setBottomTab("spacetime")}>
            Diagrama espaço-tempo (Lamport)
          </button>
        </div>
        <div className="bottom-body">
          {bottomTab === "log" ? <EventLog events={events} showHeartbeats={showHeartbeats} /> : <SpaceTime events={events} />}
        </div>
      </section>
    </div>
  );
}
