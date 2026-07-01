import type { MessageType, MutexState } from "../shared/types";

// Cores por tipo de mensagem (usadas nas setas e no log).
export const TYPE_COLORS: Record<MessageType, string> = {
  APP: "#4aa3ff",
  MUTEX_REQUEST: "#ff9f40",
  MUTEX_GRANT: "#ffd24a",
  MUTEX_RELEASE: "#ffbe6b",
  ELECTION: "#b18cff",
  ANSWER: "#9b7bff",
  COORDINATOR: "#5ef0b0",
  HEARTBEAT: "#3a4a66",
  HEARTBEAT_ACK: "#33415c",
};

// Rótulos amigáveis por tipo.
export const TYPE_LABELS: Record<MessageType, string> = {
  APP: "APP",
  MUTEX_REQUEST: "REQUEST",
  MUTEX_GRANT: "GRANT",
  MUTEX_RELEASE: "RELEASE",
  ELECTION: "ELECTION",
  ANSWER: "ANSWER",
  COORDINATOR: "COORDINATOR",
  HEARTBEAT: "HEARTBEAT",
  HEARTBEAT_ACK: "HB_ACK",
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

export function isCausal(type: MessageType): boolean {
  return type !== "HEARTBEAT" && type !== "HEARTBEAT_ACK";
}
