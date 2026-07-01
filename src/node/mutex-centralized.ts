import type { NodeContext } from "./context";
import type { MutexState, NodeId, WireMessage } from "../shared/types";
import { CS_HOLD_MS } from "../config";

// Exclusão mútua CENTRALIZADA (Tanenbaum & Van Steen, 6.3.1 / slides 15).
//
//   - Existe um COORDENADOR (o mesmo eleito pelo Bully).
//   - Para entrar na seção crítica (SC), o nó envia MUTEX_REQUEST ao coordenador.
//   - O coordenador concede (MUTEX_GRANT) se a SC estiver livre; senão enfileira.
//   - Ao sair, o nó envia MUTEX_RELEASE; o coordenador concede ao próximo da fila.
//
// Diferencial didático: a fila do coordenador é ordenada pelo timestamp de
// LAMPORT do pedido (desempate por id) — assim o relógio lógico tem um uso
// concreto: dar uma ordem justa a pedidos "concorrentes".
//
// PROBLEMA demonstrável: o coordenador é ponto único de falha. Se ele cai,
// ninguém consegue entrar na SC até uma nova eleição.
export class MutexCentralized {
  // Estado do nó como SOLICITANTE.
  private state: MutexState = "released";
  private holdTimer: ReturnType<typeof setTimeout> | null = null;

  // Estado usado apenas quando este nó é o COORDENADOR.
  private busy = false;
  private holder: NodeId | null = null;
  private queue: { id: NodeId; lamport: number }[] = [];

  constructor(private readonly ctx: NodeContext) {}

  get currentState(): MutexState {
    return this.state;
  }

  private queueIds(): NodeId[] {
    return this.queue.map((q) => q.id);
  }

  // ---- Lado SOLICITANTE -----------------------------------------------------

  request(): void {
    if (this.state !== "released") {
      this.ctx.log("já estou querendo/dentro da SC");
      return;
    }
    this.state = "wanted";
    this.ctx.emitMutex(this.state, this.queueIds());
    this.ctx.log("quero entrar na seção crítica");

    const coord = this.ctx.coordinator;
    if (coord === null) {
      this.ctx.log("não há coordenador! pedido fica pendente até a eleição", "warn");
      return;
    }
    if (coord === this.ctx.id) {
      this.coordHandleRequest(this.ctx.id, this.ctx.clock.get());
    } else {
      this.ctx.send("MUTEX_REQUEST", coord);
    }
  }

  release(): void {
    if (this.state !== "held") return;
    if (this.holdTimer) {
      clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }
    this.state = "released";
    this.ctx.emitMutex(this.state, this.queueIds());
    this.ctx.log("SAÍ da seção crítica");

    const coord = this.ctx.coordinator;
    if (coord === this.ctx.id) this.coordHandleRelease(this.ctx.id);
    else if (coord !== null) this.ctx.send("MUTEX_RELEASE", coord);
  }

  private onGrant(): void {
    this.state = "held";
    this.ctx.emitMutex(this.state, this.queueIds());
    this.ctx.log("ENTREI na seção crítica");
    // Libera automaticamente depois de um tempo, para a demo fluir sozinha.
    this.holdTimer = setTimeout(() => this.release(), CS_HOLD_MS);
  }

  // ---- Lado COORDENADOR -----------------------------------------------------

  private coordHandleRequest(from: NodeId, lamport: number): void {
    this.ctx.log(`[coord] pedido de SC de ${from} (ts=${lamport})`);
    if (!this.busy) {
      this.grantTo(from);
    } else {
      this.queue.push({ id: from, lamport });
      // Ordena por (lamport, id): ordem lógica de Lamport, desempate determinístico.
      this.queue.sort((a, b) => a.lamport - b.lamport || a.id - b.id);
      this.ctx.emitMutex(this.state, this.queueIds());
      this.ctx.log(`[coord] SC ocupada por ${this.holder}; ${from} entra na fila`);
    }
  }

  private grantTo(id: NodeId): void {
    this.busy = true;
    this.holder = id;
    this.ctx.emitMutex(this.state, this.queueIds());
    this.ctx.log(`[coord] concede SC a ${id}`);
    if (id === this.ctx.id) this.onGrant();
    else this.ctx.send("MUTEX_GRANT", id);
  }

  private coordHandleRelease(from: NodeId): void {
    if (this.holder !== from) {
      this.ctx.log(`[coord] RELEASE de ${from} ignorado (não era o detentor)`, "warn");
      return;
    }
    this.ctx.log(`[coord] ${from} liberou a SC`);
    this.busy = false;
    this.holder = null;
    const next = this.queue.shift();
    this.ctx.emitMutex(this.state, this.queueIds());
    if (next) this.grantTo(next.id);
  }

  // ---- Roteamento de mensagens ---------------------------------------------

  handle(msg: WireMessage): void {
    switch (msg.type) {
      case "MUTEX_REQUEST": // só chega aqui se eu for o coordenador
        this.coordHandleRequest(msg.from, msg.lamport);
        break;
      case "MUTEX_GRANT":
        this.onGrant();
        break;
      case "MUTEX_RELEASE": // só chega aqui se eu for o coordenador
        this.coordHandleRelease(msg.from);
        break;
    }
  }

  // Chamado quando o coordenador muda (após uma eleição).
  onCoordinatorChange(newCoord: NodeId | null): void {
    // Reinicia a contabilidade do lado-coordenador: um coordenador recém-eleito
    // começa do zero (não herda a fila do anterior, que pode ter caído).
    this.busy = false;
    this.holder = null;
    this.queue = [];

    // Se eu estava esperando a SC, reenvio o pedido ao novo coordenador.
    if (this.state === "wanted" && newCoord !== null) {
      this.ctx.log(`reenvio meu pedido de SC ao novo coordenador ${newCoord}`);
      if (newCoord === this.ctx.id) this.coordHandleRequest(this.ctx.id, this.ctx.clock.get());
      else this.ctx.send("MUTEX_REQUEST", newCoord);
    } else if (this.state === "held") {
      this.ctx.log("eu estava na SC durante a troca de coordenador", "warn");
    }
    this.ctx.emitMutex(this.state, this.queueIds());
  }

  // Chamado quando o nó crasha: limpa todo o estado.
  reset(): void {
    if (this.holdTimer) {
      clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }
    this.state = "released";
    this.busy = false;
    this.holder = null;
    this.queue = [];
  }
}
