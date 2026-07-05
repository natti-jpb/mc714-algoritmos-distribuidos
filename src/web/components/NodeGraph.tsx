import { useEffect, useRef, useState } from "react";
import type { MessageType, NodeId } from "../../shared/types";
import type { LogEntry, UINode } from "../types";
import { MUTEX_COLORS, MUTEX_LABELS, nodeColor, TYPE_COLORS, TYPE_LABELS } from "../theme";

interface Props {
  nodes: UINode[];
  events: LogEntry[];
  delayMs: number; // atraso de entrega: o ponto viaja durante esse tempo (chega quando a msg chega)
}

interface Flight {
  key: string;
  from: NodeId;
  to: NodeId;
  type: MessageType;
  color: string;
  born: number;
}

const CX = 320;
const CY = 300;
const R = 210;
const NODE_R = 38;

function layout(ids: NodeId[]): Map<NodeId, { x: number; y: number }> {
  const map = new Map<NodeId, { x: number; y: number }>();
  ids.forEach((id, i) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / ids.length;
    map.set(id, { x: CX + R * Math.cos(ang), y: CY + R * Math.sin(ang) });
  });
  return map;
}

const ease = (t: number) => t * t * (3 - 2 * t);

const LINGER_MS = 700; // quanto a seta permanece visível após a mensagem chegar

export function NodeGraph({ nodes, events, delayMs }: Props) {
  const flightsRef = useRef<Flight[]>([]);
  const lastSeqRef = useRef<number>(-1);
  const [, setTick] = useState(0);
  // O ponto viaja durante o atraso de entrega (chega quando a mensagem chega);
  // depois a seta ainda fica visível por um tempinho para dar para ler o rótulo.
  const travel = Math.max(250, delayMs);
  const life = travel + LINGER_MS;

  // Cria animações de "voo" para cada nova mensagem enviada.
  useEffect(() => {
    if (events.length === 0) return;
    if (lastSeqRef.current === -1) {
      lastSeqRef.current = events[events.length - 1].seq; // não anima histórico
      return;
    }
    const fresh: LogEntry[] = [];
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].seq <= lastSeqRef.current) break;
      fresh.push(events[i]);
    }
    lastSeqRef.current = events[events.length - 1].seq;
    for (const e of fresh.reverse()) {
      if (e.t.kind !== "send") continue;
      const type = e.t.msg.type;
      flightsRef.current.push({
        key: String(e.seq),
        from: e.t.msg.from,
        to: e.t.msg.to,
        type,
        color: TYPE_COLORS[type],
        born: performance.now(),
      });
    }
  }, [events]);

  // Loop de animação.
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const now = performance.now();
      flightsRef.current = flightsRef.current.filter((f) => now - f.born < life);
      setTick((x) => (x + 1) % 1_000_000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [life]);

  const ids = nodes.map((n) => n.id);
  const pos = layout(ids);
  const aliveIds = nodes.filter((n) => n.alive).map((n) => n.id);
  const now = performance.now();

  return (
    <svg viewBox="0 0 640 600" className="node-graph" role="img" aria-label="Grafo dos nós">
      {/* malha (arestas entre nós vivos) */}
      {aliveIds.map((a, i) =>
        aliveIds.slice(i + 1).map((b) => {
          const pa = pos.get(a)!;
          const pb = pos.get(b)!;
          return <line key={`${a}-${b}`} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} className="edge" />;
        }),
      )}

      {/* mensagens em voo: SETA DIRECIONAL + rótulo + ponto se movendo */}
      {flightsRef.current.map((f) => {
        const A = pos.get(f.from);
        const B = pos.get(f.to);
        if (!A || !B) return null;

        const dx = B.x - A.x;
        const dy = B.y - A.y;
        const L = Math.hypot(dx, dy) || 1;
        const ux = dx / L;
        const uy = dy / L;
        const perpx = -uy;
        const perpy = ux;
        const OFF = 11; // desloca a seta lateralmente (setas opostas não se sobrepõem)

        const sx = A.x + ux * (NODE_R + 3) + perpx * OFF;
        const sy = A.y + uy * (NODE_R + 3) + perpy * OFF;
        const ex = B.x - ux * (NODE_R + 11) + perpx * OFF;
        const ey = B.y - uy * (NODE_R + 11) + perpy * OFF;

        // ponta da seta (triângulo)
        const ah = 11;
        const aw = 5.5;
        const bx = ex - ux * ah;
        const by = ey - uy * ah;
        const head = `${ex},${ey} ${bx + perpx * aw},${by + perpy * aw} ${bx - perpx * aw},${by - perpy * aw}`;

        // ponto viaja durante o ATRASO de entrega (chega quando a mensagem chega)
        const age = now - f.born;
        const p = ease(Math.min(1, age / travel));
        const dotx = sx + (ex - sx) * p;
        const doty = sy + (ey - sy) * p;

        // totalmente visível enquanto viaja; some durante o "linger" após chegar
        const opacity = age < travel ? 1 : Math.max(0, 1 - (age - travel) / LINGER_MS);

        // rótulo no meio da seta, com fundo para legibilidade
        const label = TYPE_LABELS[f.type];
        const mx = (sx + ex) / 2 + perpx * 2;
        const my = (sy + ey) / 2 + perpy * 2;
        const w = label.length * 6.6 + 10;

        return (
          <g key={f.key} opacity={opacity}>
            <line x1={sx} y1={sy} x2={ex} y2={ey} stroke={f.color} strokeWidth={2.4} strokeLinecap="round" />
            <polygon points={head} fill={f.color} />
            <circle cx={dotx} cy={doty} r={5} fill={f.color} className="flight" />
            <rect x={mx - w / 2} y={my - 9} width={w} height={16} rx={4} fill="#0d1220" opacity={0.85} stroke={f.color} strokeWidth={0.8} />
            <text x={mx} y={my + 3} textAnchor="middle" className="flight-label" fill={f.color}>
              {label}
            </text>
          </g>
        );
      })}

      {/* nós */}
      {nodes.map((n) => {
        const p = pos.get(n.id)!;
        const isCoord = n.alive && n.coordinator === n.id;
        const fill = n.alive ? MUTEX_COLORS[n.mutex] : "#222a3d";
        const idColor = n.alive ? nodeColor(n.id) : "#5b6683";
        return (
          <g key={n.id} transform={`translate(${p.x},${p.y})`} className={n.alive ? "node" : "node node-dead"}>
            {n.inElection && <circle r={NODE_R + 8} className="ring-election" />}
            {isCoord && <circle r={NODE_R + 5} className="ring-coord" />}
            {/* anel de IDENTIDADE (cor fixa do nó) */}
            <circle r={NODE_R} fill={fill} stroke={idColor} strokeWidth={4} />
            {isCoord && (
              <text className="crown" y={-NODE_R - 14} textAnchor="middle">
                👑
              </text>
            )}
            <text className="node-id" y={-6} textAnchor="middle" fill={idColor}>
              n{n.id}
            </text>
            <text className="node-clock" y={13} textAnchor="middle">
              ⏱ {n.lamport}
            </text>
            <text className="node-state" y={NODE_R + 18} textAnchor="middle">
              {n.alive ? MUTEX_LABELS[n.mutex] : "CRASH"}
            </text>
            {n.queue.length > 0 && (
              <text className="node-queue" y={NODE_R + 34} textAnchor="middle">
                fila: {n.queue.join(", ")}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
