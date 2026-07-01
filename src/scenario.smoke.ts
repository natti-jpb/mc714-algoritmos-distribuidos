// Cenário end-to-end (atua como um "navegador headless"): conecta no observer,
// dispara comandos e imprime a timeline. Serve para validar os 3 algoritmos
// num cluster real de processos.
//
//   1) sobe o cluster:   npm run dev:cluster
//   2) noutro terminal:  npx tsx src/scenario.smoke.ts
import { WebSocket } from "ws";
import { OBSERVER_URL, CLUSTER_SIZE } from "./config";
import type { Command, Telemetry } from "./shared/types";

const COORD = CLUSTER_SIZE - 1; // coordenador inicial = maior id
const ws = new WebSocket(`${OBSERVER_URL}/?role=browser`);

function send(cmd: Command): void {
  ws.send(JSON.stringify(cmd));
}

function fmt(t: Telemetry): string | null {
  const tag = `n${t.nodeId}@${t.lamport}`;
  switch (t.kind) {
    case "send":
      return `${tag}  --${t.msg.type}-->  n${t.msg.to}`;
    case "recv":
      return `${tag}  <--${t.msg.type}--  n${t.msg.from}`;
    case "mutex":
      return `${tag}  [mutex=${t.state}${t.queue.length ? ` fila=${t.queue.join(",")}` : ""}]`;
    case "coordinator":
      return `${tag}  [coordenador=${t.coordinator}]`;
    case "election":
      return `${tag}  [eleição:${t.phase}]`;
    case "node_up":
      return `${tag}  NODE UP`;
    case "node_down":
      return `${tag}  NODE DOWN`;
    case "log":
      return `${tag}  ${t.level === "warn" ? "⚠ " : ""}${t.text}`;
    case "blocked":
      return `${tag}  ✗ bloqueado ${t.msg.type}->n${t.msg.to} (${t.reason})`;
    default:
      return null;
  }
}

ws.on("message", (data) => {
  const m = JSON.parse(data.toString());
  if (m.type === "snapshot") {
    const summary = (m.nodes as { id: number; alive: boolean; coordinator: number | null }[])
      .map((n) => `n${n.id}:${n.alive ? "up" : "down"}`)
      .join(" ");
    console.log(`[snapshot] ${summary || "(vazio)"}`);
  } else if (m.type === "event") {
    const line = fmt(m.t as Telemetry);
    if (line) console.log(line);
  }
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

ws.on("open", async () => {
  console.log("=== conectado ao observer ===");
  await sleep(3500); // deixa a malha conectar e o boot estabilizar

  console.log("\n=== LAMPORT: nó 0 envia mensagem de aplicação para nó 2 ===");
  send({ cmd: "trigger_event", nodeId: 0 });
  send({ cmd: "send_app", from: 0, to: 2 });
  await sleep(1500);

  console.log("\n=== EXCLUSÃO MÚTUA: nós 1 e 2 pedem a SC ao mesmo tempo ===");
  send({ cmd: "request_cs", nodeId: 1 });
  send({ cmd: "request_cs", nodeId: 2 });
  await sleep(1200);

  console.log(`\n=== FALHA: mato o coordenador (n${COORD}) enquanto há fila ===`);
  send({ cmd: "kill", nodeId: COORD });
  await sleep(6000); // detecção + eleição + reenvio do pedido pendente

  console.log(`\n=== RECUPERAÇÃO: revivo n${COORD} (deve reassumir como valentão) ===`);
  send({ cmd: "revive", nodeId: COORD });
  await sleep(5000);

  console.log("\n=== fim do cenário ===");
  process.exit(0);
});

ws.on("error", (e) => {
  console.error("erro ao conectar no observer (o cluster está rodando?):", e.message);
  process.exit(1);
});
