import { useState } from "react";
import type { Command } from "../../shared/types";
import type { UINode } from "../types";

interface Props {
  nodes: UINode[];
  send: (cmd: Command) => void;
}

export function Controls({ nodes, send }: Props) {
  const ids = nodes.map((n) => n.id);
  const [appFrom, setAppFrom] = useState(0);
  const [appTo, setAppTo] = useState(1);
  const [linkFrom, setLinkFrom] = useState(0);
  const [linkTo, setLinkTo] = useState(1);
  const [delay, setDelay] = useState(800);
  const [drop, setDrop] = useState(false);

  return (
    <div className="controls">
      <h3>Ações por nó</h3>
      <div className="node-rows">
        {nodes.map((n) => (
          <div className="node-row" key={n.id}>
            <span className="node-tag">
              n{n.id}
              {n.coordinator === n.id && n.alive ? " 👑" : ""}
              {!n.alive ? " 💀" : ""}
            </span>
            <button className="btn" disabled={!n.alive} onClick={() => send({ cmd: "trigger_event", nodeId: n.id })}>
              Evento
            </button>
            <button className="btn" disabled={!n.alive} onClick={() => send({ cmd: "request_cs", nodeId: n.id })}>
              Pedir SC
            </button>
            <button className="btn" disabled={!n.alive} onClick={() => send({ cmd: "release_cs", nodeId: n.id })}>
              Liberar
            </button>
            <button className="btn" disabled={!n.alive} onClick={() => send({ cmd: "force_election", nodeId: n.id })}>
              Eleição
            </button>
            {n.alive ? (
              <button className="btn btn-danger" onClick={() => send({ cmd: "kill", nodeId: n.id })}>
                Matar
              </button>
            ) : (
              <button className="btn btn-revive" onClick={() => send({ cmd: "revive", nodeId: n.id })}>
                Reviver
              </button>
            )}
          </div>
        ))}
      </div>

      <h3>Mensagem de aplicação (demo Lamport)</h3>
      <div className="field-row">
        <label>
          de
          <select value={appFrom} onChange={(e) => setAppFrom(Number(e.target.value))}>
            {ids.map((i) => (
              <option key={i} value={i}>
                n{i}
              </option>
            ))}
          </select>
        </label>
        <label>
          para
          <select value={appTo} onChange={(e) => setAppTo(Number(e.target.value))}>
            {ids.map((i) => (
              <option key={i} value={i}>
                n{i}
              </option>
            ))}
          </select>
        </label>
        <button className="btn" disabled={appFrom === appTo} onClick={() => send({ cmd: "send_app", from: appFrom, to: appTo })}>
          Enviar APP
        </button>
      </div>

      <h3>Falha de link (injeção)</h3>
      <div className="field-row">
        <label>
          de
          <select value={linkFrom} onChange={(e) => setLinkFrom(Number(e.target.value))}>
            {ids.map((i) => (
              <option key={i} value={i}>
                n{i}
              </option>
            ))}
          </select>
        </label>
        <label>
          para
          <select value={linkTo} onChange={(e) => setLinkTo(Number(e.target.value))}>
            {ids.map((i) => (
              <option key={i} value={i}>
                n{i}
              </option>
            ))}
          </select>
        </label>
        <label>
          atraso(ms)
          <input type="number" min={0} step={100} value={delay} onChange={(e) => setDelay(Number(e.target.value))} />
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={drop} onChange={(e) => setDrop(e.target.checked)} />
          descartar
        </label>
        <button className="btn" disabled={linkFrom === linkTo} onClick={() => send({ cmd: "set_link", from: linkFrom, to: linkTo, delayMs: delay, drop })}>
          Aplicar
        </button>
        <button className="btn" disabled={linkFrom === linkTo} onClick={() => send({ cmd: "set_link", from: linkFrom, to: linkTo, delayMs: 0, drop: false })}>
          Limpar
        </button>
      </div>
    </div>
  );
}
