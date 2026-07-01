// Teste de fumaça: prova que duas instâncias de Transport trocam mensagens
// por WebSocket/TCP real e que o relógio de Lamport é atualizado corretamente.
//   Execução:  npx tsx src/shared/transport.smoke.ts
import { Transport, type PeerInfo } from "./transport";
import { LamportClock } from "./lamport";
import type { WireMessage } from "./types";

const peers: PeerInfo[] = [
  { id: 0, host: "127.0.0.1", port: 9100 },
  { id: 1, host: "127.0.0.1", port: 9101 },
];

function makeNode(id: number) {
  const clock = new LamportClock();
  const transport = new Transport(id, peers[id].port, peers, {
    onMessage: (msg) => {
      const c = clock.onReceive(msg.lamport);
      console.log(`[nó ${id}] RECV ${msg.type} de ${msg.from} (ts=${msg.lamport}) -> relógio=${c}`);
    },
    onPeerUp: (p) => console.log(`[nó ${id}] peer ${p} conectado`),
  });
  transport.start();
  return { id, clock, transport };
}

const n0 = makeNode(0);
const n1 = makeNode(1);

function sendApp(from: { id: number; clock: LamportClock; transport: Transport }, to: number) {
  const ts = from.clock.onSend();
  const msg: WireMessage = { type: "APP", from: from.id, to, lamport: ts, msgId: `m-${from.id}-${to}` };
  console.log(`[nó ${from.id}] SEND APP -> ${to} (ts=${ts})`);
  from.transport.send(msg);
}

setTimeout(() => sendApp(n0, 1), 1200);
setTimeout(() => sendApp(n1, 0), 2200);
setTimeout(() => {
  console.log(`[fim] relógios finais: nó0=${n0.clock.get()} nó1=${n1.clock.get()}`);
  n0.transport.stop();
  n1.transport.stop();
  process.exit(0);
}, 3200);
