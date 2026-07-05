import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "node:http";
import type { Command, NodeId, NodeView, Telemetry } from "../shared/types";
import { OBSERVER_PORT } from "../config";

// OBSERVER / painel de controle.
//
// NÃO faz parte dos algoritmos distribuídos. É só instrumentação:
//   - recebe telemetria de cada nó (plano de observação);
//   - agrega uma timeline global e o estado de cada nó;
//   - retransmite tudo para o(s) navegador(es);
//   - roteia comandos do navegador para o nó-alvo (estímulos / injeção de falhas).
//
// As DECISÕES dos algoritmos acontecem nos nós, via mensagens nó-a-nó reais.

const nodeSockets = new Map<NodeId, WebSocket>();
const browsers = new Set<WebSocket>();
const eventLog: { seq: number; t: Telemetry }[] = [];
const nodeStates = new Map<NodeId, NodeView>();
let seq = 0;

const MAX_LOG = 5000;

function defaultView(id: NodeId): NodeView {
  return { id, alive: true, lamport: 0, mutex: "released", coordinator: null, inElection: false, connectedPeers: [] };
}

function applyToState(t: Telemetry): void {
  const s = nodeStates.get(t.nodeId) ?? defaultView(t.nodeId);
  s.lamport = t.lamport;
  switch (t.kind) {
    case "node_up":
      s.alive = true;
      s.coordinator = t.coordinator;
      break;
    case "node_down":
      s.alive = false;
      break;
    case "mutex":
      s.mutex = t.state;
      break;
    case "coordinator":
      s.coordinator = t.coordinator;
      break;
    case "election":
      s.inElection = t.phase === "started";
      break;
  }
  nodeStates.set(t.nodeId, s);
}

function broadcastToBrowsers(obj: unknown): void {
  const data = JSON.stringify(obj);
  for (const ws of browsers) if (ws.readyState === WebSocket.OPEN) ws.send(data);
}

function handleTelemetry(data: string): void {
  let t: Telemetry;
  try {
    t = JSON.parse(data);
  } catch {
    return;
  }
  applyToState(t);
  const entry = { seq: seq++, t };
  eventLog.push(entry);
  if (eventLog.length > MAX_LOG) eventLog.shift();
  broadcastToBrowsers({ type: "event", ...entry });
}

function commandTarget(cmd: Command): NodeId | null {
  if ("nodeId" in cmd) return cmd.nodeId;
  if ("from" in cmd) return cmd.from; // send_app, set_link
  return null;
}

function handleCommand(data: string): void {
  let cmd: Command;
  try {
    cmd = JSON.parse(data);
  } catch {
    return;
  }
  // Comandos GLOBAIS (sem nó-alvo) vão para TODOS os nós.
  if (cmd.cmd === "set_msg_delay" || cmd.cmd === "set_death_timeout" || cmd.cmd === "reset") {
    if (cmd.cmd === "reset") {
      // Zera a timeline agregada e manda o navegador limpar a tela; os nós
      // reemitem node_up logo em seguida, repovoando o estado.
      eventLog.length = 0;
      nodeStates.clear();
      seq = 0;
      broadcastToBrowsers({ type: "reset" });
    }
    const s = JSON.stringify(cmd);
    for (const ws of nodeSockets.values()) if (ws.readyState === WebSocket.OPEN) ws.send(s);
    return;
  }
  const target = commandTarget(cmd);
  if (target === null) return;
  const ws = nodeSockets.get(target);
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(cmd));
}

const wss = new WebSocketServer({ port: OBSERVER_PORT });
wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
  const params = new URLSearchParams((req.url ?? "").split("?")[1] ?? "");
  const nodeIdParam = params.get("nodeId");

  if (nodeIdParam !== null) {
    // Conexão de um NÓ (telemetria + comandos).
    const nodeId = Number(nodeIdParam);
    nodeSockets.set(nodeId, ws);
    ws.on("message", (d) => handleTelemetry(d.toString()));
    ws.on("close", () => {
      if (nodeSockets.get(nodeId) === ws) nodeSockets.delete(nodeId);
    });
  } else {
    // Conexão do NAVEGADOR (recebe telemetria, envia comandos).
    browsers.add(ws);
    ws.send(JSON.stringify({ type: "snapshot", events: eventLog.slice(-1000), nodes: [...nodeStates.values()] }));
    ws.on("message", (d) => handleCommand(d.toString()));
    ws.on("close", () => browsers.delete(ws));
  }
});

console.log(`[observer] ouvindo na porta ${OBSERVER_PORT} (nós e navegador conectam aqui)`);

process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
