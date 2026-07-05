import type { NodeId } from "../../shared/types";
import type { LogEntry } from "../types";
import { TYPE_COLORS } from "../theme";

// Diagrama espaço-tempo de Lamport: cada nó é uma coluna; o tempo lógico cresce
// para baixo. Pontos são eventos; setas diagonais são mensagens (send -> recv).
// Permite VER que C(a)<C(b) não implica a->b: eventos sem seta conectando-os
// podem ser concorrentes mesmo tendo timestamps comparáveis.

interface Props {
  events: LogEntry[];
}

const COL_W = 130;
const ROW_H = 26;
const PAD_TOP = 40;
const PAD_LEFT = 70;
const MAX_EVENTS = 140;

interface Pt {
  node: NodeId;
  lamport: number;
  kind: string;
  msgId?: string;
  msgType?: string;
}

export function SpaceTime({ events }: Props) {
  // Coleta eventos (mensagens e eventos internos) recentes.
  const causal: LogEntry[] = [];
  for (let i = events.length - 1; i >= 0 && causal.length < MAX_EVENTS; i--) {
    const t = events[i].t;
    if (t.kind === "send" || t.kind === "recv" || t.kind === "event") causal.push(events[i]);
  }
  causal.reverse();

  const ids = [...new Set(causal.map((e) => e.t.nodeId))].sort((a, b) => a - b);
  if (ids.length === 0) {
    return <div className="log-empty">Faça eventos/mensagens para o diagrama aparecer…</div>;
  }
  const col = new Map<NodeId, number>();
  ids.forEach((id, i) => col.set(id, PAD_LEFT + i * COL_W));

  const maxLamport = Math.max(1, ...causal.map((e) => e.t.lamport));
  const y = (l: number) => PAD_TOP + l * ROW_H;
  const height = y(maxLamport) + ROW_H;
  const width = PAD_LEFT + ids.length * COL_W;

  const pts: Pt[] = causal.map((e) => {
    const t = e.t;
    if (t.kind === "send" || t.kind === "recv") {
      return { node: t.nodeId, lamport: t.lamport, kind: t.kind, msgId: t.msg.msgId, msgType: t.msg.type };
    }
    return { node: t.nodeId, lamport: t.lamport, kind: t.kind };
  });

  // Níveis de tempo lógico (Lamport) que têm algum evento — viram linhas + rótulos.
  const levels = [...new Set(pts.map((p) => p.lamport))].sort((a, b) => a - b);

  // Pareia send -> recv por msgId.
  const sends = new Map<string, Pt>();
  const recvs = new Map<string, Pt>();
  for (const p of pts) {
    if (p.kind === "send" && p.msgId) sends.set(p.msgId, p);
    if (p.kind === "recv" && p.msgId) recvs.set(p.msgId, p);
  }

  return (
    <div className="spacetime-scroll">
      <svg width={width} height={height} className="spacetime">
        {/* escala de TEMPO LÓGICO (Lamport): rótulos à esquerda + linhas de grade */}
        <text x={PAD_LEFT - 34} y={PAD_TOP - 18} textAnchor="end" className="st-label">
          t
        </text>
        {levels.map((l) => (
          <g key={`lv-${l}`}>
            <line x1={PAD_LEFT - 24} y1={y(l)} x2={width - 8} y2={y(l)} className="st-grid" />
            <text x={PAD_LEFT - 34} y={y(l) + 4} textAnchor="end" className="st-time">
              {l}
            </text>
          </g>
        ))}

        {/* eixos verticais por nó */}
        {ids.map((id) => {
          const x = col.get(id)!;
          return (
            <g key={id}>
              <line x1={x} y1={PAD_TOP - 10} x2={x} y2={height - 8} className="st-axis" />
              <text x={x} y={PAD_TOP - 18} textAnchor="middle" className="st-label">
                n{id}
              </text>
            </g>
          );
        })}

        {/* mensagens (setas diagonais) */}
        {[...sends.entries()].map(([msgId, s]) => {
          const r = recvs.get(msgId);
          if (!r) return null;
          const x1 = col.get(s.node)!;
          const x2 = col.get(r.node)!;
          return (
            <line
              key={msgId}
              x1={x1}
              y1={y(s.lamport)}
              x2={x2}
              y2={y(r.lamport)}
              stroke={TYPE_COLORS[(s.msgType ?? "APP") as keyof typeof TYPE_COLORS]}
              strokeWidth={1.5}
              markerEnd="url(#arrow)"
              opacity={0.8}
            />
          );
        })}

        {/* pontos de evento */}
        {pts.map((p, i) => (
          <circle
            key={i}
            cx={col.get(p.node)!}
            cy={y(p.lamport)}
            r={p.kind === "event" ? 5 : 4}
            fill={p.msgType ? TYPE_COLORS[p.msgType as keyof typeof TYPE_COLORS] : "#e6e9f0"}
            stroke="#0f1320"
          />
        ))}

        <defs>
          <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="#8893ab" />
          </marker>
        </defs>
      </svg>
    </div>
  );
}
