// Tipos compartilhados entre nós, observer e webapp.

export type NodeId = number;
export type Lamport = number;

/**
 * Tipos de mensagem trocados ENTRE NÓS (plano dos algoritmos).
 * Toda mensagem carrega um timestamp de Lamport.
 */
export type MessageType =
  // Evento de aplicação genérico (serve para demonstrar Lamport em mensagens arbitrárias).
  | "APP" //     nó -> nó: mensagem de aplicação (espera resposta APP_ACK)
  | "APP_ACK" // nó -> nó: resposta à mensagem de aplicação (prova que está vivo)
  // Exclusão mútua centralizada.
  | "MUTEX_REQUEST" // nó -> coordenador: quero entrar na seção crítica (SC)
  | "MUTEX_ACK" //     coordenador -> nó: recebi seu pedido (você está na fila) — prova de vida
  | "MUTEX_GRANT" //   coordenador -> nó: pode entrar
  | "MUTEX_RELEASE" // nó -> coordenador: saí da SC
  // Eleição Bully.
  | "ELECTION" //     nó -> ids maiores: iniciei uma eleição
  | "ANSWER" //       id maior -> iniciador: estou vivo, eu assumo a partir daqui
  | "COORDINATOR"; // vencedor -> todos: sou o novo coordenador

export interface WireMessage {
  type: MessageType;
  from: NodeId;
  to: NodeId;
  lamport: Lamport; // relógio de Lamport do remetente no instante do envio
  msgId: string; // id único (para animação/rastreio na UI)
  payload?: Record<string, unknown>;
}

export type MutexState = "released" | "wanted" | "held";

// ----------------------------------------------------------------------------
// Telemetria: nó -> observer -> navegador. NÃO faz parte dos algoritmos;
// é apenas instrumentação para a visualização.
// ----------------------------------------------------------------------------
interface TelemetryBase {
  nodeId: NodeId;
  lamport: Lamport;
  wallTime: number; // Date.now() no instante da emissão
}

export type Telemetry = TelemetryBase &
  (
    | { kind: "node_up"; coordinator: NodeId | null; peers: NodeId[] }
    | { kind: "node_down" }
    | { kind: "event"; label: string } // evento local que avançou o relógio
    | { kind: "send"; msg: WireMessage }
    | { kind: "recv"; msg: WireMessage }
    | { kind: "blocked"; msg: WireMessage; reason: string } // envio bloqueado (link caído/atrasado)
    | { kind: "mutex"; state: MutexState; queue: NodeId[] }
    | { kind: "coordinator"; coordinator: NodeId | null }
    | { kind: "election"; phase: "started" | "won" | "lost" | "idle" }
    | { kind: "log"; level: "info" | "warn"; text: string }
  );

// ----------------------------------------------------------------------------
// Comandos: navegador -> observer -> nós. Estímulos externos / injeção de falhas.
// ----------------------------------------------------------------------------
export type Command =
  | { cmd: "trigger_event"; nodeId: NodeId } // evento interno local (avança relógio)
  | { cmd: "request_cs"; nodeId: NodeId } // nó quer a seção crítica
  | { cmd: "release_cs"; nodeId: NodeId } // nó libera a seção crítica
  | { cmd: "send_app"; from: NodeId; to: NodeId } // envia mensagem de aplicação (demo Lamport)
  | { cmd: "kill"; nodeId: NodeId } // simula crash (crash-stop)
  | { cmd: "revive"; nodeId: NodeId } // recupera o nó
  | { cmd: "force_election"; nodeId: NodeId } // dispara eleição manualmente
  | { cmd: "set_msg_delay"; delayMs: number } // atraso artificial de TODA mensagem (global)
  | { cmd: "set_death_timeout"; ms: number } // tempo sem resposta até considerar um nó morto (global)
  | { cmd: "reset" } // reinicia tudo: relógios, estados e o log (global)
  | { cmd: "set_link"; from: NodeId; to: NodeId; delayMs: number; drop: boolean }; // falha de link

// Estado consolidado de um nó, enviado ao navegador para renderização.
export interface NodeView {
  id: NodeId;
  alive: boolean;
  lamport: Lamport;
  mutex: MutexState;
  coordinator: NodeId | null;
  inElection: boolean;
  connectedPeers: NodeId[];
}
