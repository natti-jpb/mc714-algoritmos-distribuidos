import { useState } from "react";
import type { Command } from "../../shared/types";
import type { UINode } from "../types";
import { nodeColor } from "../theme";

interface Props {
  nodes: UINode[];
  send: (cmd: Command) => void;
}

// "?" que mostra a explicação como tooltip ao passar o mouse (title nativo).
function Help({ text }: { text: string }) {
  return (
    <span className="help-btn" title={text} aria-label="Ajuda" role="img">
      ?
    </span>
  );
}

const HELP_DETECT =
  "Detecção de falha é MANUAL. Para simular o Bully passo a passo:\n" +
  "1) Matar o coordenador (crash silencioso — nada acontece sozinho).\n" +
  "2) Pedir SC ou enviar uma mensagem de aplicação a ele.\n" +
  "Sem resposta dentro do tempo configurado, o solicitante o declara morto e inicia a eleição.\n" +
  "Reiniciar (no topo) zera relógios, estados e o log — cada nó volta com um relógio de Lamport inicial diferente.";

const HELP_LINK =
  "Simula um problema de rede num sentido específico (de um nó para outro).\n" +
  "• Atraso: segura as mensagens desse link por N ms.\n" +
  "• Descartar: joga fora todas as mensagens do link.\n" +
  "Ex.: de n1 para o coordenador com 'descartar' faz o coordenador parecer morto para n1 — ao pedir SC / enviar APP, n1 dispara uma eleição (falsa detecção).\n" +
  "Aplicar liga; Limpar desfaz.";

function NodeDot({ id }: { id: number }) {
  return <span className="node-dot" style={{ background: nodeColor(id) }} />;
}

export function Controls({ nodes, send }: Props) {
  const ids = nodes.map((n) => n.id);
  const [appFrom, setAppFrom] = useState(0);
  const [appTo, setAppTo] = useState(1);
  const [linkFrom, setLinkFrom] = useState(0);
  const [linkTo, setLinkTo] = useState(1);
  const [delay, setDelay] = useState(800);
  const [drop, setDrop] = useState(false);
  const [deathMs, setDeathMs] = useState(2500);

  return (
    <div className="controls">
      <div className="section-head">
        <span>Detecção de falha (manual)</span>
        <Help text={HELP_DETECT} />
      </div>
      <div className="field-row">
        <label title="Tempo sem resposta até um nó declarar o outro morto (usado ao pedir SC ou enviar APP)">
          Considerar nó morto após (ms)
          <input
            type="number"
            min={200}
            step={250}
            value={deathMs}
            onChange={(e) => {
              const v = Number(e.target.value);
              setDeathMs(v);
              send({ cmd: "set_death_timeout", ms: v });
            }}
          />
        </label>
      </div>

      <h3>Ações por nó</h3>
      <div className="node-rows">
        {nodes.map((n) => (
          <div className="node-row" key={n.id}>
            <span className="node-tag" style={{ color: nodeColor(n.id) }}>
              <NodeDot id={n.id} />n{n.id}
              {n.coordinator === n.id && n.alive ? " 👑" : ""}
              {!n.alive ? " 💀" : ""}
            </span>
            <button className="btn" title="Evento interno: avança o relógio de Lamport deste nó" disabled={!n.alive} onClick={() => send({ cmd: "trigger_event", nodeId: n.id })}>
              Evento
            </button>
            <button className="btn" title="Pede a seção crítica ao coordenador (se ele estiver morto, dispara eleição)" disabled={!n.alive} onClick={() => send({ cmd: "request_cs", nodeId: n.id })}>
              Pedir SC
            </button>
            <button className="btn" title="Sai da seção crítica (libera para o próximo da fila)" disabled={!n.alive} onClick={() => send({ cmd: "release_cs", nodeId: n.id })}>
              Liberar
            </button>
            <button className="btn" title="Força o início de uma eleição Bully a partir deste nó" disabled={!n.alive} onClick={() => send({ cmd: "force_election", nodeId: n.id })}>
              Eleição
            </button>
            {n.alive ? (
              <button className="btn btn-danger" title="Crash silencioso: o nó para de responder (sem fechar a conexão)" onClick={() => send({ cmd: "kill", nodeId: n.id })}>
                Matar
              </button>
            ) : (
              <button className="btn btn-revive" title="Recupera o nó: ele volta e dispara uma eleição (Bully)" onClick={() => send({ cmd: "revive", nodeId: n.id })}>
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
        <button
          className="btn"
          title="Envia uma mensagem de aplicação (espera APP_ACK); sem resposta, o destino é dado como morto"
          disabled={appFrom === appTo}
          onClick={() => send({ cmd: "send_app", from: appFrom, to: appTo })}
        >
          Enviar APP
        </button>
      </div>

      <div className="section-head">
        <h3>Falha de link (injeção)</h3>
        <Help text={HELP_LINK} />
      </div>
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
        <button className="btn" title="Aplica atraso/descarte no link de → para" disabled={linkFrom === linkTo} onClick={() => send({ cmd: "set_link", from: linkFrom, to: linkTo, delayMs: delay, drop })}>
          Aplicar
        </button>
        <button className="btn" title="Remove a falha do link de → para" disabled={linkFrom === linkTo} onClick={() => send({ cmd: "set_link", from: linkFrom, to: linkTo, delayMs: 0, drop: false })}>
          Limpar
        </button>
      </div>
    </div>
  );
}
