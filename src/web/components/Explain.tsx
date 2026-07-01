import { useState } from "react";

type Topic = "lamport" | "mutex" | "election";

const TABS: { id: Topic; label: string }[] = [
  { id: "lamport", label: "Relógio de Lamport" },
  { id: "mutex", label: "Exclusão mútua" },
  { id: "election", label: "Eleição (Bully)" },
];

export function Explain() {
  const [topic, setTopic] = useState<Topic>("lamport");
  return (
    <div className="explain">
      <div className="explain-tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`explain-tab ${topic === t.id ? "active" : ""}`} onClick={() => setTopic(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="explain-body">
        {topic === "lamport" && <Lamport />}
        {topic === "mutex" && <Mutex />}
        {topic === "election" && <Election />}
      </div>
    </div>
  );
}

function Lamport() {
  return (
    <>
      <p>
        Cada nó mantém um contador inteiro. <b>Regras:</b> antes de cada evento (interno ou envio) o nó incrementa o relógio; toda mensagem leva o
        relógio do remetente; ao receber com timestamp <code>ts</code>, o nó faz <code>C := max(C, ts) + 1</code>.
      </p>
      <p>
        Garante a relação <b>causal</b>: se <code>a → b</code> então <code>C(a) &lt; C(b)</code>.
      </p>
      <div className="callout problem">
        <b>⚠ Problema:</b> a recíproca <i>não</i> vale. <code>C(a) &lt; C(b)</code> <b>não</b> implica <code>a → b</code> — eventos concorrentes
        recebem uma ordem arbitrária (desempatada por id). Lamport dá ordem <i>total</i>, mas não distingue causalidade de concorrência (isso exigiria
        vector clocks).
      </div>
      <div className="callout try">
        <b>Experimente:</b> clique em <b>Evento</b> em nós diferentes (sem trocar mensagens) — os relógios avançam de forma independente. Depois envie
        uma <b>mensagem APP</b> e veja o salto <code>max+1</code> no receptor. No <b>diagrama espaço-tempo</b>, pontos sem seta ligando-os podem ser
        concorrentes mesmo com timestamps comparáveis.
      </div>
    </>
  );
}

function Mutex() {
  return (
    <>
      <p>
        <b>Algoritmo centralizado:</b> um <b>coordenador</b> controla a seção crítica (SC). Para entrar, o nó envia <code>REQUEST</code>; o coordenador
        responde <code>GRANT</code> se a SC está livre, ou enfileira o pedido. Ao sair, o nó envia <code>RELEASE</code> e o coordenador concede ao
        próximo da fila.
      </p>
      <p>
        Aqui a fila é ordenada pelo <b>timestamp de Lamport</b> do pedido (desempate por id) — é o uso concreto do relógio lógico: dar ordem justa a
        pedidos concorrentes.
      </p>
      <div className="callout problem">
        <b>⚠ Problema:</b> o coordenador é <b>ponto único de falha</b> e gargalo. Se ele cai, ninguém entra na SC até uma nova eleição. Também não há
        tolerância a falhas do detentor da SC.
      </div>
      <div className="callout try">
        <b>Experimente:</b> peça a SC em 2 nós ao mesmo tempo (um entra, o outro vai pra fila). Depois <b>mate o coordenador</b> enquanto há fila: os
        pedidos travam até a eleição eleger um novo coordenador — então os pedidos pendentes são reenviados e atendidos.
      </div>
    </>
  );
}

function Election() {
  return (
    <>
      <p>
        <b>Bully (valentão):</b> cada nó vigia o coordenador por <i>heartbeats</i>. Sem resposta, inicia eleição enviando <code>ELECTION</code> aos
        nós de <b>id maior</b>. Quem recebe responde <code>ANSWER</code> e inicia a sua. Quem não recebe nenhum <code>ANSWER</code> vence e anuncia{" "}
        <code>COORDINATOR</code> a todos. O <b>maior id</b> sempre vence.
      </p>
      <div className="callout problem">
        <b>⚠ Problemas:</b> <b>tempestade de mensagens</b> — várias eleições simultâneas quando muitos detectam a falha juntos (até O(n²) mensagens). E
        ao se recuperar, o nó de maior id <b>reassume à força</b>, podendo disparar novas eleições.
      </div>
      <div className="callout try">
        <b>Experimente:</b> <b>mate o coordenador</b> (maior id) e veja a tempestade de <code>ELECTION</code> e o segundo-maior assumir. Depois{" "}
        <b>reviva-o</b>: ele dispara eleição e reassume (valentão). Ou injete <b>atraso/descarte</b> no link com o coordenador para provocar uma
        detecção de falha <i>falsa</i>.
      </div>
    </>
  );
}
