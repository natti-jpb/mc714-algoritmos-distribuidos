import type { MessageType, MutexState } from "../shared/types";

// Cores por tipo de mensagem (usadas nas setas e no log).
// Paleta escolhida para MÁXIMO contraste entre tipos que aparecem juntos
// (ex.: ELECTION x ANSWER, APP x APP_ACK, os três de exclusão mútua).
export const TYPE_COLORS: Record<MessageType, string> = {
  APP: "#3b82f6", // azul
  APP_ACK: "#22d3ee", // ciano
  MUTEX_REQUEST: "#f59e0b", // âmbar
  MUTEX_ACK: "#fcd34d", // amarelo claro (confirmação de recebimento)
  MUTEX_GRANT: "#a3e635", // lima
  MUTEX_RELEASE: "#f43f5e", // vermelho-rosa
  ELECTION: "#a855f7", // roxo
  ANSWER: "#ec4899", // rosa/magenta
  COORDINATOR: "#10b981", // verde esmeralda
};

// Rótulos amigáveis por tipo.
export const TYPE_LABELS: Record<MessageType, string> = {
  APP: "APP",
  APP_ACK: "APP_ACK",
  MUTEX_REQUEST: "REQUEST",
  MUTEX_ACK: "REQ_ACK",
  MUTEX_GRANT: "GRANT",
  MUTEX_RELEASE: "RELEASE",
  ELECTION: "ELECTION",
  ANSWER: "ANSWER",
  COORDINATOR: "COORDINATOR",
};

export const MUTEX_COLORS: Record<MutexState, string> = {
  released: "#3b4a6b",
  wanted: "#ff9f40",
  held: "#5ef0b0",
};

export const MUTEX_LABELS: Record<MutexState, string> = {
  released: "livre",
  wanted: "quer SC",
  held: "na SC",
};

// Cor de IDENTIDADE de cada nó (para distinguir nós no grafo, controles e log).
const NODE_PALETTE = ["#60a5fa", "#f472b6", "#34d399", "#fbbf24", "#a78bfa", "#fb7185", "#38bdf8", "#c084fc"];
export function nodeColor(id: number): string {
  const n = NODE_PALETTE.length;
  return NODE_PALETTE[((id % n) + n) % n];
}
