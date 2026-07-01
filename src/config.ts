import type { PeerInfo } from "./shared/transport";

// Configuração do cluster. Pode ser sobrescrita por variáveis de ambiente
// (usado pelo Docker Compose, onde cada nó é um contêiner).
export const CLUSTER_SIZE = Number(process.env.CLUSTER_SIZE ?? 5);
export const HOST = process.env.HOST ?? "127.0.0.1";
export const NODE_BASE_PORT = Number(process.env.NODE_BASE_PORT ?? 9200);
export const OBSERVER_PORT = Number(process.env.OBSERVER_PORT ?? 8080);
export const OBSERVER_URL = process.env.OBSERVER_URL ?? `ws://${HOST}:${OBSERVER_PORT}`;

// Tempos (ms). Calibrados para a demonstração ser observável a olho nu.
export const STARTUP_GRACE_MS = 2000; // espera a malha conectar antes de detectar falhas
export const HEARTBEAT_INTERVAL_MS = 1000; // de quanto em quanto o nó pinga o coordenador
export const HEARTBEAT_TIMEOUT_MS = 2500; // sem ACK nesse tempo => coordenador é dado como morto
export const ELECTION_ANSWER_TIMEOUT_MS = 1500; // espera por ANSWER após enviar ELECTION
export const CS_HOLD_MS = 3000; // tempo que um nó segura a seção crítica antes de liberar

export function defaultPeers(): PeerInfo[] {
  return Array.from({ length: CLUSTER_SIZE }, (_, id) => ({
    id,
    host: HOST,
    port: NODE_BASE_PORT + id,
  }));
}
