import type { PeerInfo } from "./shared/transport";

// Configuração do cluster. Pode ser sobrescrita por variáveis de ambiente
// (usado pelo Docker Compose, onde cada nó é um contêiner).
export const CLUSTER_SIZE = Number(process.env.CLUSTER_SIZE ?? 5);
export const HOST = process.env.HOST ?? "127.0.0.1";
export const NODE_BASE_PORT = Number(process.env.NODE_BASE_PORT ?? 9200);
export const OBSERVER_PORT = Number(process.env.OBSERVER_PORT ?? 8080);
export const OBSERVER_URL = process.env.OBSERVER_URL ?? `ws://${HOST}:${OBSERVER_PORT}`;

// Tempos (ms). Calibrados para a demonstração ser observável a olho nu.
export const REVIVE_GRACE_MS = 600; // após reviver: pequena pausa antes de o nó disparar sua eleição
export const ELECTION_ANSWER_TIMEOUT_MS = 1500; // espera por ANSWER após enviar ELECTION (piso; escala com o atraso)
// Atraso ARTIFICIAL de entrega de TODA mensagem (ms). Faz as trocas serem
// sequenciais e observáveis (pedido -> resposta acontece DEPOIS que a mensagem
// chega, não no mesmo instante). Ajustável em tempo real pela UI (velocidade).
export const BASE_MSG_DELAY_MS = 1000;
export const CS_HOLD_MS = 3000; // tempo que um nó segura a seção crítica antes de liberar
export const DEATH_TIMEOUT_MS = 2500; // padrão: sem resposta nesse tempo => nó é dado como morto (ajustável na UI)
export const MAX_INITIAL_CLOCK = 8; // relógio de Lamport inicial de cada nó: aleatório em [0, MAX_INITIAL_CLOCK]

export function defaultPeers(): PeerInfo[] {
  return Array.from({ length: CLUSTER_SIZE }, (_, id) => ({
    id,
    host: HOST,
    port: NODE_BASE_PORT + id,
  }));
}
