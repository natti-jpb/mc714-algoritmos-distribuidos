import type { LamportClock } from "../shared/lamport";
import type { MessageType, MutexState, NodeId } from "../shared/types";

// Interface que os módulos de algoritmo (exclusão mútua, eleição) usam para
// interagir com o nó: enviar mensagens, ler o relógio, emitir telemetria, etc.
// Mantém os algoritmos desacoplados da infraestrutura (transporte/observer).
export interface NodeContext {
  readonly id: NodeId;
  readonly allIds: NodeId[]; // todos os ids do cluster (inclui o próprio)
  readonly clock: LamportClock;
  coordinator: NodeId | null;

  isAlive(): boolean;

  /** Envia mensagem para um nó (carimba Lamport e emite telemetria). */
  send(type: MessageType, to: NodeId, payload?: Record<string, unknown>): void;
  /** Envia para todos os nós de id MAIOR que o próprio. */
  broadcastToHigher(type: MessageType, payload?: Record<string, unknown>): void;
  /** Envia para todos os outros nós. */
  broadcastAll(type: MessageType, payload?: Record<string, unknown>): void;

  log(text: string, level?: "info" | "warn"): void;
  setCoordinator(id: NodeId | null): void;
  emitMutex(state: MutexState, queue: NodeId[]): void;
  emitElection(phase: "started" | "won" | "lost" | "idle"): void;
}
