import type { NodeContext } from "./context";
import type { WireMessage } from "../shared/types";
import { ELECTION_ANSWER_TIMEOUT_MS, HEARTBEAT_INTERVAL_MS, HEARTBEAT_TIMEOUT_MS } from "../config";

// Algoritmo de eleição BULLY (Garcia-Molina, 1982 / Tanenbaum 6.4.1 / slides 16).
//
// Detecção de falha: cada nó (não-coordenador) envia HEARTBEAT ao coordenador e
// espera HEARTBEAT_ACK. Se o ACK não chega a tempo, o coordenador é dado como
// morto e o nó inicia uma eleição.
//
// Eleição:
//   - Se o nó já é o de maior id, declara-se coordenador (COORDINATOR a todos).
//   - Senão envia ELECTION aos ids MAIORES e espera ANSWER.
//       * sem ANSWER  => venceu => anuncia COORDINATOR.
//       * com ANSWER  => alguém maior assume; espera o anúncio COORDINATOR.
//   - Ao receber ELECTION de um id menor, responde ANSWER e inicia sua própria eleição.
//
// PROBLEMAS demonstráveis: tempestade de mensagens (várias eleições simultâneas)
// e "valentão" — o maior id sempre vence; ao voltar, ele reassume à força.
export class BullyElection {
  private running = false;
  private inElection = false;
  private gotAnswer = false;
  private awaitingAck = false;

  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private hbTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private answerTimer: ReturnType<typeof setTimeout> | null = null;
  private coordWaitTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly ctx: NodeContext) {}

  private hasHigher(): boolean {
    return this.ctx.allIds.some((i) => i > this.ctx.id);
  }

  start(): void {
    this.running = true;
    this.inElection = false;
    this.gotAnswer = false;
    this.awaitingAck = false;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => this.pingCoordinator(), HEARTBEAT_INTERVAL_MS);
  }

  stop(): void {
    this.running = false;
    this.inElection = false;
    this.awaitingAck = false;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.clearTimeouts();
    this.heartbeatTimer = null;
  }

  private clearTimeouts(): void {
    if (this.hbTimeoutTimer) clearTimeout(this.hbTimeoutTimer);
    if (this.answerTimer) clearTimeout(this.answerTimer);
    if (this.coordWaitTimer) clearTimeout(this.coordWaitTimer);
    this.hbTimeoutTimer = null;
    this.answerTimer = null;
    this.coordWaitTimer = null;
  }

  // ---- Detecção de falha (heartbeat) ---------------------------------------

  private pingCoordinator(): void {
    if (!this.running || !this.ctx.isAlive()) return;
    const coord = this.ctx.coordinator;
    if (coord === null || coord === this.ctx.id) return; // eu sou o coordenador (ou não há um)

    this.ctx.send("HEARTBEAT", coord);
    if (!this.awaitingAck) {
      this.awaitingAck = true;
      this.hbTimeoutTimer = setTimeout(() => {
        this.awaitingAck = false;
        this.ctx.log(`coordenador ${coord} não respondeu ao heartbeat`, "warn");
        this.startElection();
      }, HEARTBEAT_TIMEOUT_MS);
    }
  }

  onHeartbeat(msg: WireMessage): void {
    // Só respondo se de fato me considero o coordenador.
    if (this.ctx.coordinator === this.ctx.id) {
      this.ctx.send("HEARTBEAT_ACK", msg.from);
    }
  }

  onHeartbeatAck(msg: WireMessage): void {
    if (msg.from === this.ctx.coordinator) {
      this.awaitingAck = false;
      if (this.hbTimeoutTimer) {
        clearTimeout(this.hbTimeoutTimer);
        this.hbTimeoutTimer = null;
      }
    }
  }

  // ---- Eleição --------------------------------------------------------------

  startElection(): void {
    if (!this.ctx.isAlive() || this.inElection) return;
    this.inElection = true;
    this.gotAnswer = false;
    this.ctx.emitElection("started");
    this.ctx.log("iniciei uma ELEIÇÃO");

    if (!this.hasHigher()) {
      this.win();
      return;
    }
    this.ctx.broadcastToHigher("ELECTION");
    this.answerTimer = setTimeout(() => {
      if (!this.gotAnswer) this.win(); // ninguém maior respondeu => eu venço
    }, ELECTION_ANSWER_TIMEOUT_MS);
  }

  private win(): void {
    this.inElection = false;
    this.clearTimeouts();
    this.ctx.log("VENCI a eleição — sou o novo COORDENADOR");
    this.ctx.emitElection("won");
    this.ctx.setCoordinator(this.ctx.id);
    this.ctx.broadcastAll("COORDINATOR");
  }

  handle(msg: WireMessage): void {
    switch (msg.type) {
      case "ELECTION": {
        // Um id menor iniciou eleição: respondo ANSWER e inicio a minha.
        this.ctx.send("ANSWER", msg.from);
        this.ctx.log(`recebi ELECTION de ${msg.from}; respondo ANSWER e inicio minha eleição`);
        this.startElection();
        break;
      }
      case "ANSWER": {
        this.gotAnswer = true;
        this.ctx.emitElection("lost");
        this.ctx.log(`recebi ANSWER de ${msg.from}; aguardo o anúncio do novo coordenador`);
        if (this.coordWaitTimer) clearTimeout(this.coordWaitTimer);
        this.coordWaitTimer = setTimeout(() => {
          // O coordenador prometido nunca anunciou: recomeço a eleição.
          this.inElection = false;
          this.ctx.log("novo coordenador não anunciou a tempo; reinicio eleição", "warn");
          this.startElection();
        }, ELECTION_ANSWER_TIMEOUT_MS * 2);
        break;
      }
      case "COORDINATOR": {
        if (msg.from < this.ctx.id && this.ctx.isAlive()) {
          // Um id MENOR se declarou coordenador, mas eu sou maior: eu mando (bully).
          this.ctx.log(`${msg.from} se declarou coordenador, mas ${this.ctx.id} é maior; inicio eleição`, "warn");
          this.inElection = false;
          this.startElection();
        } else {
          this.inElection = false;
          this.gotAnswer = false;
          this.clearTimeouts();
          this.ctx.emitElection("idle");
          this.ctx.log(`${msg.from} é o novo COORDENADOR`);
          this.ctx.setCoordinator(msg.from);
        }
        break;
      }
    }
  }

  // Reseta a detecção de falha quando o coordenador muda.
  onCoordinatorChange(): void {
    this.awaitingAck = false;
    if (this.hbTimeoutTimer) {
      clearTimeout(this.hbTimeoutTimer);
      this.hbTimeoutTimer = null;
    }
  }
}
