import type { NodeContext } from "./context";
import type { WireMessage } from "../shared/types";
import { ELECTION_ANSWER_TIMEOUT_MS } from "../config";

// Algoritmo de eleição BULLY (Garcia-Molina, 1982 / Tanenbaum 6.4.1 / slides 16).
//
// DETECÇÃO DE FALHA É MANUAL: não há heartbeat automático. Um nó "nota que o
// coordenador não responde" ao enviar uma mensagem de aplicação (APP) que fica
// sem resposta (APP_ACK) — ver node.ts. Só então ele chama startElection().
//
// Eleição:
//   - Se o nó já é o de maior id, declara-se coordenador (COORDINATOR a todos).
//   - Senão envia ELECTION aos ids MAIORES e espera ANSWER.
//       * sem ANSWER  => venceu => anuncia COORDINATOR.
//       * com ANSWER  => alguém maior assume; espera o anúncio COORDINATOR.
//   - Ao receber ELECTION de um id menor, responde ANSWER e inicia sua própria eleição.
//
// PROBLEMA demonstrável: "valentão" — o maior id sempre vence; ao voltar (revive),
// ele reassume à força.
export class BullyElection {
  private inElection = false;
  private gotAnswer = false;
  private answerTimer: ReturnType<typeof setTimeout> | null = null;
  private coordWaitTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly ctx: NodeContext) {}

  private hasHigher(): boolean {
    return this.ctx.allIds.some((i) => i > this.ctx.id);
  }

  // Espera por ANSWER: precisa cobrir o ida-e-volta de uma mensagem (que agora
  // tem atraso artificial). Piso em ELECTION_ANSWER_TIMEOUT_MS.
  private answerTimeout(): number {
    return Math.max(ELECTION_ANSWER_TIMEOUT_MS, this.ctx.msgDelayMs * 3);
  }

  // Cancela qualquer eleição em curso (usado ao crashar).
  stop(): void {
    this.inElection = false;
    this.gotAnswer = false;
    this.clearTimeouts();
  }

  private clearTimeouts(): void {
    if (this.answerTimer) clearTimeout(this.answerTimer);
    if (this.coordWaitTimer) clearTimeout(this.coordWaitTimer);
    this.answerTimer = null;
    this.coordWaitTimer = null;
  }

  startElection(): void {
    if (!this.ctx.isAlive() || this.inElection) return;
    this.inElection = true;
    this.gotAnswer = false;
    this.ctx.emitElection("started");
    this.ctx.log("iniciei uma ELEIÇÃO");

    if (!this.hasHigher()) {
      this.win(); // sou o maior: venço imediatamente
      return;
    }
    this.ctx.broadcastToHigher("ELECTION");
    this.answerTimer = setTimeout(() => {
      if (!this.gotAnswer) this.win(); // ninguém maior respondeu => eu venço
    }, this.answerTimeout());
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
        }, this.answerTimeout() * 2);
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
}
