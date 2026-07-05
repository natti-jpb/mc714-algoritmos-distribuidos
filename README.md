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

- **Cabeçalho:** botão **↻ Reiniciar tudo** (zera relógios, estados e o log —
  cada nó volta com um **relógio de Lamport inicial diferente**) e o controle de
  **velocidade**, que ajusta um **atraso artificial de entrega** de toda mensagem
  (ms/msg). Diminuir a velocidade torna as trocas **sequenciais e observáveis**: a
  resposta só sai depois que a mensagem chega.
- **Grafo (esquerda):** cada nó tem uma **cor de identidade fixa** (anel colorido)
  e mostra seu **relógio de Lamport** (⏱); a cor de preenchimento indica o estado
  de exclusão mútua (cinza=livre, laranja=quer SC, verde=na SC), com a **coroa
  👑** no coordenador e **💀** em quem caiu. As setas **rotuladas** são as
  mensagens em trânsito (legenda no topo).
- **Controles (direita):** um campo **“Considerar nó morto após (ms)”** (tempo
  sem resposta até declarar morto) e, por nó, `Evento`, `Pedir SC`, `Liberar`,
  `Eleição`, `Matar`/`Reviver`. Tanto **Pedir SC** quanto o envio de **mensagem
  de aplicação** esperam uma resposta do coordenador; sem resposta no prazo, o
  solicitante o **declara morto e inicia a eleição** (detecção de falha manual).
  Há ainda a injeção de **falha de link** (atraso/descarte). Os “?” mostram a
  explicação ao passar o mouse.
- **Explicação (direita):** aba **Comunicação (real)** — descreve a troca de
  mensagens por WebSocket/TCP — além do texto didático de cada algoritmo e **seus
  problemas**.
- **Log de eventos (abaixo do grafo):** timeline colorida, com cada nó em sua cor.
- **Diagrama espaço-tempo:** o clássico diagrama de Lamport — colunas por nó,
  tempo lógico para baixo, setas = mensagens.

### Experimentos sugeridos (ótimos para o vídeo)

1. **Lamport:** clique `Evento` em nós diferentes (relógios sobem de forma
   independente); depois envie uma mensagem **APP** e veja o salto `max+1` no
   receptor (e o `APP_ACK` de volta). Abra o **diagrama espaço-tempo**.
2. **Exclusão mútua:** clique `Pedir SC` em dois nós quase ao mesmo tempo — um
   entra (verde), o outro vai para a **fila** do coordenador.
3. **Detecção de falha passo a passo (Bully):** **mate o
   coordenador** (crash silencioso — nada acontece sozinho, a conexão continua de
   pé); envie uma **mensagem de aplicação** de um nó (ex.: n1) para o coordenador.
   Sem `APP_ACK`, o remetente **declara o coordenador morto** e **inicia a
   eleição** — reproduzindo "quando um processo nota que o coordenador não
   responde às requisições, ele inicia uma eleição".
4. **Eleição em cadeia:** o iniciador envia `ELECTION` aos maiores; os maiores
   respondem `ANSWER` (mandam-no parar) e cada um inicia a própria eleição; o de
   maior id vence e anuncia `COORDINATOR` a todos (a coroa migra). Acompanhe pelas
   **setas rotuladas** no grafo.
5. **Valentão:** **reviva** o ex-coordenador (maior id) e veja-o **reassumir**:
   ao voltar ele faz uma eleição e, sendo o maior, vence na hora.

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

## Referências

Ver **[RELATORIO.md](RELATORIO.md)** para a lista completa de referências e a
declaração sobre uso de código de terceiros.
