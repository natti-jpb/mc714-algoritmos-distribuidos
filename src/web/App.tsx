import { useEffect, useState } from "react";
import { useObserver } from "./useObserver";
import { NodeGraph } from "./components/NodeGraph";
import { Controls } from "./components/Controls";
import { EventLog } from "./components/EventLog";
import { SpaceTime } from "./components/SpaceTime";
import { Explain } from "./components/Explain";
import { TYPE_COLORS, TYPE_LABELS } from "./theme";
import type { MessageType } from "../shared/types";

const LEGEND: MessageType[] = ["APP", "APP_ACK", "MUTEX_REQUEST", "MUTEX_GRANT", "MUTEX_RELEASE", "ELECTION", "ANSWER", "COORDINATOR"];

// Atraso base (ms) a velocidade 1. A UI escala isto: velocidade menor => atraso
// MAIOR (troca de mensagens mais lenta e sequencial). Deve casar com o backend.
const BASE_DELAY = 1000;

export function App() {
  const { connected, nodes, events, send } = useObserver();
  const [speed, setSpeed] = useState(1);
  const delayMs = Math.round(BASE_DELAY / speed);

  // Propaga o atraso artificial a todos os nós (e ressincroniza ao reconectar).
  useEffect(() => {
    if (connected) send({ cmd: "set_msg_delay", delayMs });
  }, [delayMs, connected, send]);
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
          <button
            className="btn btn-reset"
            title="Reinicia todos os nós: relógios, estados e o log voltam ao início (cada nó com um relógio de Lamport inicial diferente)"
            onClick={() => send({ cmd: "reset" })}
          >
            ↻ Reiniciar tudo
          </button>
          <label className="speed">
            velocidade
            <input type="range" min={0.1} max={2} step={0.05} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} />
            <span className="speed-val">{delayMs} ms/msg</span>
          </label>
          <span className={`conn ${connected ? "on" : "off"}`}>{connected ? "● conectado" : "○ desconectado"}</span>
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
            <NodeGraph nodes={nodes} events={events} delayMs={delayMs} />
          )}
        </section>

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
            {bottomTab === "log" ? <EventLog events={events} /> : <SpaceTime events={events} />}
          </div>
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
    </div>
  );
}
