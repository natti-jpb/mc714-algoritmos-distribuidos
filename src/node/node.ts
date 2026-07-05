import { LamportClock } from "../shared/lamport";
import { Transport, type PeerInfo } from "../shared/transport";
import type { Command, MessageType, MutexState, NodeId, WireMessage } from "../shared/types";
import type { NodeContext } from "./context";
import { ObserverClient } from "./observer-client";
import { MutexCentralized } from "./mutex-centralized";
import { BullyElection } from "./election-bully";
import { BASE_MSG_DELAY_MS, DEATH_TIMEOUT_MS, MAX_INITIAL_CLOCK, REVIVE_GRACE_MS } from "../config";

// Relógio de Lamport inicial (distinto por nó) para tornar a simulação de tempo
// lógico interessante desde o começo — os relógios NÃO começam todos em zero.
function randomInitialClock(): number {
  return Math.floor(Math.random() * (MAX_INITIAL_CLOCK + 1));
}

// Um nó do sistema distribuído. Costura os três algoritmos:
//   - relógio de Lamport (em todas as mensagens);
//   - exclusão mútua centralizada;
//   - eleição Bully (detecção de falha MANUAL, via mensagem sem resposta).
// Roda como PROCESSO independente (um contêiner por nó no Docker), trocando
// mensagens reais com os peers via WebSocket/TCP.
export class DistributedNode implements NodeContext {
  readonly id: NodeId;
  readonly allIds: NodeId[];
  readonly clock = new LamportClock();
  coordinator: NodeId | null;
  msgDelayMs = BASE_MSG_DELAY_MS; // atraso artificial de entrega (ajustável pela UI)

  private alive = true;
  private seq = 0;
  private deathTimeoutBase = DEATH_TIMEOUT_MS; // valor pedido pela UI (piso efetivo abaixo)
  // Mensagens APP enviadas aguardando APP_ACK: se o ACK não chega a tempo, o
  // destino é considerado morto (detecção de falha por AUSÊNCIA de resposta).
  private pendingAppAck = new Map<NodeId, ReturnType<typeof setTimeout>>();
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
      onPeerUp: () => {}, // conexão da malha: ruído, não vai para o log
      onPeerDown: (p) => this.onPeerDown(p),
      onSendBlocked: (m, reason) =>
        this.observer.telemetry({ kind: "blocked", nodeId: this.id, lamport: this.clock.get(), wallTime: Date.now(), msg: m, reason }),
    });
    this.observer = new ObserverClient(observerUrl, id, (cmd) => this.handleCommand(cmd), () => this.emitUp());
    this.mutex = new MutexCentralized(this);
    this.election = new BullyElection(this);
    this.transport.setBaseDelay(this.msgDelayMs);
    this.clock.set(randomInitialClock()); // relógios começam em instantes distintos
  }

  // Tempo efetivo até declarar um alvo morto: nunca menor que o ida-e-volta de
  // uma mensagem (senão um nó VIVO seria declarado morto por engano).
  get deathTimeoutMs(): number {
    return Math.max(this.deathTimeoutBase, this.msgDelayMs * 3);
  }

  startElection(): void {
    this.election.startElection();
  }

  start(): void {
    this.transport.start();
    this.emitUp();
    // Sem detecção automática: o nó assume o coordenador inicial (maior id) e só
    // dispara eleição quando o usuário provoca (mensagem sem resposta / botão).
  }

  // ---------------------------------------------------------------- NodeContext
  isAlive(): boolean {
    return this.alive;
  }

  send(type: MessageType, to: NodeId, payload?: Record<string, unknown>): void {
    if (!this.alive) return;
    // Toda mensagem é causal: incrementa o relógio de Lamport no envio.
    const lamport = this.clock.onSend();
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
    if (changed) this.mutex.onCoordinatorChange(id);
  }

  // ---------------------------------------------------------------- roteamento
  private onMessage(msg: WireMessage): void {
    if (!this.alive) return;
    this.clock.onReceive(msg.lamport); // regra de recepção de Lamport
    this.observer.telemetry({ kind: "recv", nodeId: this.id, lamport: this.clock.get(), wallTime: Date.now(), msg });

    switch (msg.type) {
      case "APP":
        // Recebi uma mensagem de aplicação: respondo com APP_ACK (prova de vida).
        this.send("APP_ACK", msg.from);
        break;
      case "APP_ACK":
        this.onAppAck(msg.from);
        break;
      case "MUTEX_REQUEST":
      case "MUTEX_ACK":
      case "MUTEX_GRANT":
      case "MUTEX_RELEASE":
        this.mutex.handle(msg);
        break;
      case "ELECTION":
      case "ANSWER":
      case "COORDINATOR":
        this.election.handle(msg);
        break;
    }
  }

  private onPeerDown(_p: NodeId): void {
    // Não faz nada: a detecção de falha é sempre manual (mensagem sem resposta).
    // A queda de conexão não gera log nem eleição (evita ruído).
  }

  // ---------------------------------------------------------------- comandos
  private handleCommand(cmd: Command): void {
    // Um nó "crashado" só aceita recuperação (revive), reset e os ajustes
    // globais (para manter o estado consistente enquanto está morto).
    const globalWhenDead = cmd.cmd === "revive" || cmd.cmd === "reset" || cmd.cmd === "set_msg_delay" || cmd.cmd === "set_death_timeout";
    if (!this.alive && !globalWhenDead) return;
    switch (cmd.cmd) {
      case "trigger_event": {
        const c = this.clock.tick();
        this.observer.telemetry({ kind: "event", nodeId: this.id, lamport: c, wallTime: Date.now(), label: "evento interno" });
        break;
      }
      case "send_app":
        if (cmd.from === this.id) this.sendApp(cmd.to);
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
      case "set_msg_delay":
        this.msgDelayMs = Math.max(0, cmd.delayMs); // comando global: todos os nós recebem
        this.transport.setBaseDelay(this.msgDelayMs);
        break;
      case "set_death_timeout":
        this.deathTimeoutBase = Math.max(0, cmd.ms); // comando global
        break;
      case "reset":
        this.resetAll(); // comando global
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

  // Envia uma mensagem de aplicação e AGUARDA um APP_ACK. Se o destino não
  // responde dentro do tempo, é considerado morto — e, se era o coordenador,
  // este nó inicia uma eleição. É o "noto que o coordenador não responde a
  // requisições" do algoritmo Bully, disparado por uma mensagem real.
  private sendApp(to: NodeId): void {
    this.send("APP", to);
    const existing = this.pendingAppAck.get(to);
    if (existing) clearTimeout(existing);
    // Usa o tempo de morte efetivo (já cobre o ida-e-volta com o atraso atual).
    const timeout = this.deathTimeoutMs;
    const timer = setTimeout(() => {
      this.pendingAppAck.delete(to);
      this.log(`${to} NÃO respondeu à mensagem — considero-o MORTO`, "warn");
      if (to === this.coordinator) {
        this.log(`${to} era o coordenador — inicio uma eleição`, "warn");
        this.election.startElection();
      }
    }, timeout);
    this.pendingAppAck.set(to, timer);
  }

  private onAppAck(from: NodeId): void {
    const timer = this.pendingAppAck.get(from);
    if (timer) {
      clearTimeout(timer);
      this.pendingAppAck.delete(from);
    }
  }

  private clearPendingAppAcks(): void {
    for (const t of this.pendingAppAck.values()) clearTimeout(t);
    this.pendingAppAck.clear();
  }

  // Reinicia este nó ao estado inicial: vivo, coordenador = maior id, estados
  // de eleição/mutex zerados e um NOVO relógio de Lamport inicial (distinto).
  private resetAll(): void {
    this.election.stop();
    this.mutex.reset();
    this.clearPendingAppAcks();
    this.alive = true;
    this.coordinator = Math.max(...this.allIds);
    this.clock.set(randomInitialClock());
    this.transport.start(); // no-op se já estiver rodando
    this.emitUp();
    this.log("RESET — reiniciei do zero");
  }

  private kill(): void {
    if (!this.alive) return;
    this.alive = false;
    this.election.stop();
    this.mutex.reset();
    this.clearPendingAppAcks();
    // CRASH SILENCIOSO: NÃO fechamos os sockets. O nó apenas para de responder
    // (onMessage e send ignoram tudo enquanto alive=false). Assim os peers NÃO
    // percebem a queda pela conexão TCP; só descobrem por AUSÊNCIA de resposta
    // (mensagem sem APP_ACK) — fiel ao texto do Bully e o que permite a demo
    // passo a passo (matar não dispara eleição sozinho).
    this.observer.telemetry({ kind: "node_down", nodeId: this.id, lamport: this.clock.get(), wallTime: Date.now() });
    this.log("CRASH (silencioso) — paro de responder, mas a conexão continua de pé");
  }

  private revive(): void {
    if (this.alive) return;
    this.alive = true;
    this.coordinator = Math.max(...this.allIds);
    this.transport.start();
    this.emitUp();
    this.log("RECUPERADO — vou disparar uma eleição (Bully: quem volta faz eleição)");
    // Pequena pausa só para o node_up renderizar antes da eleição (a malha já
    // está conectada — o crash é silencioso e não derruba os sockets). Se este
    // nó for o de maior id, ele vence na hora e reassume ("o valentão volta").
    setTimeout(() => {
      if (this.alive) this.election.startElection();
    }, REVIVE_GRACE_MS);
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
