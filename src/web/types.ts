import type { NodeId, NodeView, Telemetry } from "../shared/types";

export interface LogEntry {
  seq: number;
  t: Telemetry;
}

// Mensagens que o observer envia ao navegador.
export type ServerMessage =
  | { type: "snapshot"; events: LogEntry[]; nodes: NodeView[] }
  | { type: "reset" }
  | ({ type: "event" } & LogEntry);

// Estado de um nó na UI (NodeView + a fila do coordenador).
export interface UINode extends NodeView {
  queue: NodeId[];
}
