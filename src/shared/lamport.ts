import type { Lamport } from "./types";

// Relógio lógico de Lamport (Lamport, 1978).
//
// Regras (Tanenbaum & Van Steen, cap. 6 / slides 14):
//   1. Antes de cada evento (interno ou envio), o nó incrementa seu relógio.
//   2. Toda mensagem carrega o relógio do remetente no instante do envio.
//   3. Ao receber uma mensagem com timestamp ts:
//        C := max(C, ts) + 1
//
// Propriedade: se a -> b (a "aconteceu antes" de b) então C(a) < C(b).
// A RECÍPROCA NÃO VALE: C(a) < C(b) NÃO implica a -> b. Eventos concorrentes
// podem receber qualquer ordem relativa — esse é o limite do relógio de Lamport
// (capturado pelos vector clocks).
export class LamportClock {
  private value = 0;

  get(): Lamport {
    return this.value;
  }

  /** Evento local / interno: incrementa e retorna o novo valor. */
  tick(): Lamport {
    this.value += 1;
    return this.value;
  }

  /** No envio: incrementa e retorna o timestamp a carimbar na mensagem. */
  onSend(): Lamport {
    return this.tick();
  }

  /** Na recepção: C := max(C, ts) + 1. */
  onReceive(received: Lamport): Lamport {
    this.value = Math.max(this.value, received) + 1;
    return this.value;
  }
}
