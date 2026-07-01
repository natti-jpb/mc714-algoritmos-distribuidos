import { WebSocket } from "ws";
import type { Command, Telemetry } from "../shared/types";

// Conexão do nó com o observer (plano de instrumentação/controle).
// É SEPARADA da malha entre nós: por aqui só passam telemetria (nó->observer)
// e comandos externos (observer->nó). NÃO participa dos algoritmos.
//
// Importante: esta conexão é mantida viva mesmo quando o nó "crasha", para que
// o comando "revive" possa alcançá-lo.
const MAX_BUFFER = 500;

export class ObserverClient {
  private ws: WebSocket | null = null;
  private closed = false;
  // Telemetria emitida antes do WS abrir fica bufferizada (senão o node_up
  // inicial, emitido durante o handshake, seria perdido).
  private buffer: string[] = [];

  constructor(
    private readonly url: string,
    private readonly nodeId: number,
    private readonly onCommand: (cmd: Command) => void,
    private readonly onOpen?: () => void,
  ) {
    this.connect();
  }

  private connect(): void {
    if (this.closed) return;
    const ws = new WebSocket(`${this.url}/?nodeId=${this.nodeId}`);
    this.ws = ws;
    ws.on("open", () => {
      for (const s of this.buffer) ws.send(s);
      this.buffer = [];
      this.onOpen?.(); // reemite o estado atual (resync em (re)conexões)
    });
    ws.on("message", (data) => {
      try {
        this.onCommand(JSON.parse(data.toString()) as Command);
      } catch {
        /* ignora payload inválido */
      }
    });
    ws.on("close", () => {
      this.ws = null;
      if (!this.closed) setTimeout(() => this.connect(), 800); // reconecta
    });
    ws.on("error", () => {
      /* o evento close cuida da reconexão */
    });
  }

  telemetry(t: Telemetry): void {
    const s = JSON.stringify(t);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(s);
    } else {
      this.buffer.push(s);
      if (this.buffer.length > MAX_BUFFER) this.buffer.shift();
    }
  }

  close(): void {
    this.closed = true;
    this.ws?.close();
  }
}
