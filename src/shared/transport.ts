import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "node:http";
import type { NodeId, WireMessage } from "./types";

// Transporte de mensagens ENTRE NÓS via WebSocket sobre TCP real.
//
// Topologia: malha completa. Para haver exatamente UMA conexão por par,
// adotamos a convenção "o id menor conecta no id maior". O nó também roda
// um servidor WS que aceita conexões dos ids menores.
//
// Tudo aqui é troca de mensagens de rede de verdade (não há fila em memória
// compartilhada entre os nós). Em produção/Docker cada nó é um processo/contêiner.

export interface PeerInfo {
  id: NodeId;
  host: string;
  port: number;
}

export interface LinkFault {
  delayMs: number;
  drop: boolean;
}

export interface TransportEvents {
  onMessage: (msg: WireMessage) => void;
  onPeerUp?: (peerId: NodeId) => void;
  onPeerDown?: (peerId: NodeId) => void;
  onSendBlocked?: (msg: WireMessage, reason: string) => void;
}

const RECONNECT_INTERVAL_MS = 800;

export class Transport {
  private server: WebSocketServer | null = null;
  private sockets = new Map<NodeId, WebSocket>();
  private faults = new Map<NodeId, LinkFault>();
  private reconnectTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  // Atraso artificial (ms) aplicado a TODA mensagem enviada — torna as trocas
  // observáveis/sequenciais. Somado ao atraso de falha de link, se houver.
  private baseDelayMs = 0;

  constructor(
    private readonly nodeId: NodeId,
    private readonly port: number,
    private readonly peers: PeerInfo[],
    private readonly events: TransportEvents,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;

    this.server = new WebSocketServer({ port: this.port });
    this.server.on("connection", (ws: WebSocket, req: IncomingMessage) => {
      const peerId = parsePeerId(req.url);
      if (peerId === null) {
        ws.close();
        return;
      }
      this.registerSocket(peerId, ws);
    });

    // Conecta apenas em peers de id MAIOR (uma conexão por par); o resto chega
    // como conexão de entrada. Retentativas cobrem peers ainda não prontos.
    this.reconnectTimer = setInterval(() => this.connectMissing(), RECONNECT_INTERVAL_MS);
    this.connectMissing();
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.reconnectTimer) clearInterval(this.reconnectTimer);
    this.reconnectTimer = null;
    for (const ws of this.sockets.values()) ws.terminate();
    this.sockets.clear();
    this.server?.close();
    this.server = null;
  }

  private connectMissing(): void {
    if (!this.running) return;
    for (const peer of this.peers) {
      if (peer.id <= this.nodeId) continue; // só o menor inicia a conexão
      if (this.sockets.has(peer.id)) continue; // já conectado
      this.connectTo(peer);
    }
  }

  private connectTo(peer: PeerInfo): void {
    const url = `ws://${peer.host}:${peer.port}/?id=${this.nodeId}`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      return; // retry loop tenta de novo
    }
    ws.on("open", () => this.registerSocket(peer.id, ws));
    ws.on("error", () => {
      /* peer ainda não está pronto; o loop de reconexão cuida disso */
    });
  }

  private registerSocket(peerId: NodeId, ws: WebSocket): void {
    if (this.sockets.has(peerId)) {
      // Já existe conexão com esse peer (corrida rara); descarta a duplicada.
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      return;
    }
    this.sockets.set(peerId, ws);

    ws.on("message", (data) => {
      let msg: WireMessage;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      this.events.onMessage(msg);
    });
    ws.on("close", () => {
      if (this.sockets.get(peerId) === ws) {
        this.sockets.delete(peerId);
        this.events.onPeerDown?.(peerId);
      }
    });
    ws.on("error", () => {
      /* tratado pelo evento de close */
    });

    this.events.onPeerUp?.(peerId);
  }

  setLinkFault(peerId: NodeId, fault: LinkFault | null): void {
    if (fault) this.faults.set(peerId, fault);
    else this.faults.delete(peerId);
  }

  setBaseDelay(ms: number): void {
    this.baseDelayMs = Math.max(0, ms);
  }

  isConnected(peerId: NodeId): boolean {
    const ws = this.sockets.get(peerId);
    return !!ws && ws.readyState === WebSocket.OPEN;
  }

  connectedPeers(): NodeId[] {
    return [...this.sockets.keys()].filter((id) => this.isConnected(id));
  }

  /** Envia uma mensagem para msg.to, aplicando a falha de link configurada. */
  send(msg: WireMessage): void {
    const ws = this.sockets.get(msg.to);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      this.events.onSendBlocked?.(msg, "peer-unreachable");
      return;
    }
    const fault = this.faults.get(msg.to);
    if (fault?.drop) {
      this.events.onSendBlocked?.(msg, "link-drop");
      return;
    }
    const data = JSON.stringify(msg);
    const delay = this.baseDelayMs + (fault?.delayMs ?? 0);
    if (delay > 0) {
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(data);
      }, delay);
    } else {
      ws.send(data);
    }
  }
}

function parsePeerId(url: string | undefined): NodeId | null {
  if (!url) return null;
  const query = url.split("?")[1] ?? "";
  const id = new URLSearchParams(query).get("id");
  return id === null ? null : Number(id);
}
