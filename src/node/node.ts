import { LamportClock } from "../shared/lamport";
import { Transport, type PeerInfo } from "../shared/transport";
import type { Command, MessageType, MutexState, NodeId, WireMessage } from "../shared/types";
import type { NodeContext } from "./context";
import { ObserverClient } from "./observer-client";
import { MutexCentralized } from "./mutex-centralized";
import { BullyElection } from "./election-bully";
import { STARTUP_GRACE_MS } from "../config";

// Um nó do sistema distribuído. Costura os três algoritmos:
//   - relógio de Lamport (em todas as mensagens causais);
//   - exclusão mútua centralizada;
//   - eleição Bully.
// Roda como PROCESSO independente (um contêiner por nó no Docker), trocando
// mensagens reais com os peers via WebSocket/TCP.
export class DistributedNode implements NodeContext {
  readonly id: NodeId;
  readonly allIds: NodeId[];
  readonly clock = new LamportClock();
  coordinator: NodeId | null;

  private alive = true;
  private seq = 0;
  private readonly port: number;
  private readonly transport: Transport;
  private readonly observer: ObserverClient;
  private readonly mutex: MutexCentralized;
  private readonly election: BullyElection;

  constructor(id: NodeId, peers: PeerInfo[], observerUrl: string) {
    this.id = id;
    this.allIds = peers.map((p) => p.id).sort((a, b) => a - b);
    this.port = peers.find((p) => p.id === id)!.port;
    // Suposição inicial do Bully: o maior id é o coordenador. A detecção de
    // falha corrige isso caso ele não esteja no ar.
    this.coordinator = Math.max(...this.allIds);

    this.transport = new Transport(id, this.port, peers, {
      onMessage: (m) => this.onMessage(m),
      onPeerUp: (p) => this.log(`peer ${p} conectado`),
      onPeerDown: (p) => this.onPeerDown(p),
      onSendBlocked: (m, reason) =>
        this.observer.telemetry({ kind: "blocked", nodeId: this.id, lamport: this.clock.get(), wallTime: Date.now(), msg: m, reason }),
    });
    this.observer = new ObserverClient(observerUrl, id, (cmd) => this.handleCommand(cmd), () => this.emitUp());
    this.mutex = new MutexCentralized(this);
    this.election = new BullyElection(this);
  }

  start(): void {
    this.transport.start();
    this.emitUp();
    // Espera a malha conectar antes de começar a detectar falhas (evita
    // eleições espúrias no boot).
    setTimeout(() => {
      if (this.alive) this.election.start();
    }, STARTUP_GRACE_MS);
  }

  // ---------------------------------------------------------------- NodeContext
  isAlive(): boolean {
    return this.alive;
  }

  send(type: MessageType, to: NodeId, payload?: Record<string, unknown>): void {
    if (!this.alive) return;
    // Heartbeats são um canal de liveness fora-de-banda: NÃO participam do
    // relógio de Lamport (manteria a visualização do tempo lógico limpa).
    const causal = type !== "HEARTBEAT" && type !== "HEARTBEAT_ACK";
    const lamport = causal ? this.clock.onSend() : this.clock.get();
    const msg: WireMessage = { type, from: this.id, to, lamport, msgId: `${this.id}-${this.seq++}`, payload };
    this.observer.telemetry({ kind: "send", nodeId: this.id, lamport, wallTime: Date.now(), msg });
    this.transport.send(msg);
  }

  broadcastToHigher(type: MessageType, payload?: Record<string, unknown>): void {
    for (const id of this.allIds) if (id > this.id) this.send(type, id, payload);
  }

  broadcastAll(type: MessageType, payload?: Record<string, unknown>): void {
    for (const id of this.allIds) if (id !== this.id) this.send(type, id, payload);
  }

  log(text: string, level: "info" | "warn" = "info"): void {
    this.observer.telemetry({ kind: "log", nodeId: this.id, lamport: this.clock.get(), wallTime: Date.now(), level, text });
  }

  emitMutex(state: MutexState, queue: NodeId[]): void {
    this.observer.telemetry({ kind: "mutex", nodeId: this.id, lamport: this.clock.get(), wallTime: Date.now(), state, queue });
  }

  emitElection(phase: "started" | "won" | "lost" | "idle"): void {
    this.observer.telemetry({ kind: "election", nodeId: this.id, lamport: this.clock.get(), wallTime: Date.now(), phase });
  }

  setCoordinator(id: NodeId | null): void {
    const changed = this.coordinator !== id;
    this.coordinator = id;
    this.observer.telemetry({ kind: "coordinator", nodeId: this.id, lamport: this.clock.get(), wallTime: Date.now(), coordinator: id });
    if (changed) {
      this.election.onCoordinatorChange();
      this.mutex.onCoordinatorChange(id);
    }
  }

  // ---------------------------------------------------------------- roteamento
  private onMessage(msg: WireMessage): void {
    if (!this.alive) return;
    const causal = msg.type !== "HEARTBEAT" && msg.type !== "HEARTBEAT_ACK";
    if (causal) this.clock.onReceive(msg.lamport); // regra de recepção de Lamport
    this.observer.telemetry({ kind: "recv", nodeId: this.id, lamport: this.clock.get(), wallTime: Date.now(), msg });

    switch (msg.type) {
      case "APP":
        this.log(`evento de aplicação recebido de ${msg.from}`);
        break;
      case "MUTEX_REQUEST":
      case "MUTEX_GRANT":
      case "MUTEX_RELEASE":
        this.mutex.handle(msg);
        break;
      case "ELECTION":
      case "ANSWER":
      case "COORDINATOR":
        this.election.handle(msg);
        break;
      case "HEARTBEAT":
        this.election.onHeartbeat(msg);
        break;
      case "HEARTBEAT_ACK":
        this.election.onHeartbeatAck(msg);
        break;
    }
  }

  private onPeerDown(p: NodeId): void {
    if (!this.alive) return;
    this.log(`peer ${p} desconectado`, "warn");
    if (p === this.coordinator) {
      this.log(`coordenador ${p} caiu (conexão perdida) — inicio eleição`, "warn");
      this.election.startElection();
    }
  }

  // ---------------------------------------------------------------- comandos
  private handleCommand(cmd: Command): void {
    // Um nó "crashado" só aceita o comando de recuperação.
    if (!this.alive && cmd.cmd !== "revive") return;
    switch (cmd.cmd) {
      case "trigger_event": {
        const c = this.clock.tick();
        this.observer.telemetry({ kind: "event", nodeId: this.id, lamport: c, wallTime: Date.now(), label: "evento interno" });
        this.log("evento interno (avancei meu relógio)");
        break;
      }
      case "send_app":
        if (cmd.from === this.id) this.send("APP", cmd.to);
        break;
      case "request_cs":
        if (cmd.nodeId === this.id) this.mutex.request();
        break;
      case "release_cs":
        if (cmd.nodeId === this.id) this.mutex.release();
        break;
      case "force_election":
        if (cmd.nodeId === this.id) this.election.startElection();
        break;
      case "set_link":
        if (cmd.from === this.id) this.transport.setLinkFault(cmd.to, { delayMs: cmd.delayMs, drop: cmd.drop });
        break;
      case "kill":
        if (cmd.nodeId === this.id) this.kill();
        break;
      case "revive":
        if (cmd.nodeId === this.id) this.revive();
        break;
    }
  }

  private kill(): void {
    if (!this.alive) return;
    this.alive = false;
    this.election.stop();
    this.mutex.reset();
    this.transport.stop(); // fecha sockets: os peers detectam a queda
    this.observer.telemetry({ kind: "node_down", nodeId: this.id, lamport: this.clock.get(), wallTime: Date.now() });
    this.log("CRASH — parei de responder");
  }

  private revive(): void {
    if (this.alive) return;
    this.alive = true;
    this.coordinator = Math.max(...this.allIds);
    this.transport.start();
    this.emitUp();
    this.log("RECUPERADO — inicio uma eleição (Bully)");
    setTimeout(() => {
      if (this.alive) {
        this.election.start();
        this.election.startElection(); // nó que se recupera dispara eleição
      }
    }, STARTUP_GRACE_MS);
  }

  private emitUp(): void {
    this.observer.telemetry({
      kind: "node_up",
      nodeId: this.id,
      lamport: this.clock.get(),
      wallTime: Date.now(),
      coordinator: this.coordinator,
      peers: this.allIds.filter((i) => i !== this.id),
    });
  }
}
