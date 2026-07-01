import { useEffect, useRef, useState } from "react";
import type { NodeId } from "../../shared/types";
import type { LogEntry, UINode } from "../types";
import { isCausal, MUTEX_COLORS, MUTEX_LABELS, TYPE_COLORS } from "../theme";

interface Props {
  nodes: UINode[];
  events: LogEntry[];
  showHeartbeats: boolean;
  speed: number;
}

interface Flight {
  key: string;
  from: NodeId;
  to: NodeId;
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

export function NodeGraph({ nodes, events, showHeartbeats, speed }: Props) {
  const flightsRef = useRef<Flight[]>([]);
  const lastSeqRef = useRef<number>(-1);
  const [, setTick] = useState(0);
  const dur = 900 / speed;

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
      if (!showHeartbeats && !isCausal(type)) continue;
      flightsRef.current.push({ key: String(e.seq), from: e.t.msg.from, to: e.t.msg.to, color: TYPE_COLORS[type], born: performance.now() });
    }
  }, [events, showHeartbeats]);

  // Loop de animação.
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const now = performance.now();
      flightsRef.current = flightsRef.current.filter((f) => now - f.born < dur);
      setTick((x) => (x + 1) % 1_000_000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [dur]);

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

      {/* mensagens em voo */}
      {flightsRef.current.map((f) => {
        const pa = pos.get(f.from);
        const pb = pos.get(f.to);
        if (!pa || !pb) return null;
        const p = ease(Math.min(1, (now - f.born) / dur));
        const x = pa.x + (pb.x - pa.x) * p;
        const y = pa.y + (pb.y - pa.y) * p;
        return <circle key={f.key} cx={x} cy={y} r={7} fill={f.color} className="flight" />;
      })}

      {/* nós */}
      {nodes.map((n) => {
        const p = pos.get(n.id)!;
        const isCoord = n.alive && n.coordinator === n.id;
        const fill = n.alive ? MUTEX_COLORS[n.mutex] : "#222a3d";
        return (
          <g key={n.id} transform={`translate(${p.x},${p.y})`} className={n.alive ? "node" : "node node-dead"}>
            {n.inElection && <circle r={NODE_R + 8} className="ring-election" />}
            {isCoord && <circle r={NODE_R + 5} className="ring-coord" />}
            <circle r={NODE_R} fill={fill} stroke={isCoord ? "#ffd24a" : "#2a3550"} strokeWidth={isCoord ? 4 : 2} />
            {isCoord && (
              <text className="crown" y={-NODE_R - 14} textAnchor="middle">
                👑
              </text>
            )}
            <text className="node-id" y={-6} textAnchor="middle">
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
