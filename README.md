# MC714 — Algoritmos Distribuídos (Trabalho 2)

Demonstração **didática e interativa** de três algoritmos clássicos de sistemas
distribuídos, com **troca de mensagens real** entre processos:

- **Relógio lógico de Lamport**
- **Exclusão mútua centralizada** (algoritmo do coordenador)
- **Eleição de líder — algoritmo Bully (valentão)**

Cada nó é um **processo independente** (um contêiner no Docker) que troca
mensagens com os outros via **WebSocket sobre TCP**. Um *webapp* em React
observa o sistema em tempo real e permite **injetar estímulos e falhas**
(pedir seção crítica, matar o coordenador, atrasar/descartar mensagens) para
ver os algoritmos funcionando — **e seus problemas**.

> **Importante (sobre o critério do enunciado):** a troca de mensagens é
> **real** (WebSocket/TCP entre processos/contêineres), **não** é uma simulação
> via arquivo nem fila em memória compartilhada. O webapp e o *observer* são
> apenas **instrumentação** (painel de observação e controle); eles **não**
> participam das decisões dos algoritmos — estas acontecem nos nós, por mensagens
> nó-a-nó.

---

## Arquitetura

```
┌──────────────────────────────────────────────────────────┐
│  WEBAPP (React/Vite)  — só OBSERVA e CONTROLA             │
│  grafo dos nós · relógios · animação de mensagens ·       │
│  diagrama espaço-tempo · injeção de falhas                │
└───────────────────────────▲──────────────────────────────┘
                            │ WebSocket (telemetria + comandos)
┌───────────────────────────┴──────────────────────────────┐
│  OBSERVER (instrumentação, NÃO faz parte dos algoritmos)  │
└───────────────────────────▲──────────────────────────────┘
              telemetria ↑   │ comandos ↓   (1 conexão por nó)
        ┌────────┬───────────┴───┬────────┬────────┐
        │        │               │        │        │
     ┌──┴──┐  ┌──┴──┐         ┌──┴──┐  ┌──┴──┐  ┌──┴──┐
     │ nó0 │  │ nó1 │   ...   │ nó2 │  │ nó3 │  │ nó4 │   PROCESSOS / CONTÊINERES
     └──┬──┘  └──┬──┘         └──┬──┘  └──┬──┘  └──┬──┘
        └────────┴── malha WebSocket (troca de mensagens REAL) ──┘
```

Os três algoritmos se encaixam numa única história em torno do **coordenador**:

1. **Lamport** carimba toda mensagem causal; o coordenador ordena a fila de
   pedidos da seção crítica pelo timestamp de Lamport.
2. **Exclusão mútua centralizada**: o coordenador concede/libera a seção crítica.
3. **Bully**: quando o coordenador cai (o "problema" da exclusão mútua
   centralizada), os nós elegem um novo coordenador e o sistema se recupera.

---

## Pré-requisitos

- **Docker** (caminho recomendado), **ou**
- **Node.js 20+** e **npm** (para rodar localmente sem Docker).

---

## Como executar

### Opção A — Docker (recomendado)

```bash
docker compose up --build
```

Isso sobe o *observer*, **5 nós** (um contêiner cada) e o *webapp*. Depois abra:

```
http://localhost:5173
```

Para encerrar: `Ctrl+C` e depois `docker compose down`.

### Opção B — Node local (sem Docker)

```bash
npm install
npm run dev
```

`npm run dev` sobe, em paralelo, o cluster (observer + 5 nós, cada um em seu
próprio processo) e o servidor do webapp. Abra `http://localhost:5173`.

Scripts úteis:

| Script | O que faz |
|---|---|
| `npm run dev` | cluster + webapp juntos |
| `npm run dev:cluster` | só o cluster (observer + 5 nós) |
| `npm run dev:web` | só o webapp |
| `npm run typecheck` | checagem de tipos (TypeScript) |

O número de nós pode ser ajustado com a variável `CLUSTER_SIZE` (local).

---

## Como usar a interface

- **Grafo (centro):** cada nó mostra seu **relógio de Lamport** (⏱), seu estado
  de exclusão mútua (cor: cinza=livre, laranja=quer SC, verde=na SC), a **coroa
  👑** no coordenador e **💀** em quem caiu. As setas coloridas são as mensagens
  em trânsito (legenda no topo).
- **Controles (direita):** por nó — `Evento` (evento interno, avança o relógio),
  `Pedir SC`, `Liberar`, `Eleição`, `Matar`/`Reviver`. Também há envio de
  mensagem de aplicação (demo de Lamport) e injeção de **falha de link**
  (atraso/descarte).
- **Explicação (direita):** texto didático de cada algoritmo e **seus problemas**.
- **Log de eventos (rodapé):** timeline colorida (filtra heartbeats por padrão).
- **Diagrama espaço-tempo (rodapé):** o clássico diagrama de Lamport — colunas
  por nó, tempo lógico para baixo, setas = mensagens.

### Experimentos sugeridos (ótimos para o vídeo)

1. **Lamport:** clique `Evento` em nós diferentes (relógios sobem de forma
   independente); depois envie uma mensagem **APP** e veja o salto `max+1` no
   receptor. Abra o **diagrama espaço-tempo**.
2. **Exclusão mútua:** clique `Pedir SC` em dois nós quase ao mesmo tempo — um
   entra (verde), o outro vai para a **fila** do coordenador.
3. **Falha + eleição:** com fila pendente, **mate o coordenador**. Veja a
   **tempestade de eleições** (Bully), o novo coordenador assumir (a coroa migra)
   e os pedidos pendentes serem reenviados e atendidos.
4. **Valentão:** **reviva** o ex-coordenador (maior id) e veja-o **reassumir**.
5. **Falha de rede:** injete **atraso/descarte** no link de um nó para o
   coordenador e provoque uma detecção de falha *falsa*.

---

## Estrutura do projeto

```
src/
├── shared/         tipos, relógio de Lamport, transporte WebSocket (+ falhas)
├── node/           núcleo do nó, exclusão mútua centralizada, eleição Bully
├── observer/       servidor de instrumentação/controle (relay p/ o navegador)
├── web/            webapp React (visualização e controles)
├── config.ts       parâmetros do cluster (tamanho, portas, tempos)
└── launcher.ts      sobe observer + N nós como processos locais
docker-compose.yml   1 contêiner por nó + observer + web
RELATORIO.md         relatório técnico completo
```

---

## Roteiro sugerido para o vídeo (~10 min)

1. **(1 min)** Problema e visão geral da arquitetura (este README).
2. **(2 min)** Código: o `transport.ts` (mensagens reais por WebSocket) e o
   `node.ts` (Lamport em cada envio/recepção).
3. **(2 min)** Demo Lamport: eventos internos + mensagem APP + diagrama
   espaço-tempo; comentar que `C(a)<C(b)` não implica `a→b`.
4. **(2 min)** Demo exclusão mútua: dois pedidos concorrentes, fila por Lamport;
   comentar o ponto único de falha.
5. **(2 min)** Demo Bully: matar o coordenador → tempestade de eleições → novo
   líder → recuperação; reviver o maior id (valentão).
6. **(1 min)** Falha de rede (atraso/descarte) e conclusões.

---

## Referências

Ver **[RELATORIO.md](RELATORIO.md)** para a lista completa de referências e a
declaração sobre uso de código de terceiros.
