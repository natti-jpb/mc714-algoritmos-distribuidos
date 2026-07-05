import type { Telemetry } from "../../shared/types";
import type { LogEntry } from "../types";
import { nodeColor, TYPE_COLORS, TYPE_LABELS } from "../theme";

interface Props {
  events: LogEntry[];
}

// Só mostramos o que importa para Lamport / exclusão mútua / Bully:
//   - envios de mensagem (fluxo + tipo + relógio de Lamport);
//   - eventos internos (Lamport);
//   - narrativa das decisões (log): pedir/entrar/sair da SC, conceder, fila,
//     iniciar/vencer eleição, "declaro morto", novo coordenador;
//   - crash / recuperação e envios bloqueados (falha de link).
// O RESTO é ruído (recepções, e telemetria de estado redundante com a narrativa).
function describe(t: Telemetry): { text: string; color?: string } | null {
  switch (t.kind) {
    case "send":
      return { text: `${TYPE_LABELS[t.msg.type]} ⟶ n${t.msg.to}`, color: TYPE_COLORS[t.msg.type] };
    case "event":
      return { text: t.label };
    case "node_up":
      return { text: "no ar", color: "#5ef0b0" };
    case "node_down":
      return { text: "CRASH", color: "#ff6b6b" };
    case "blocked":
      return { text: `✗ ${TYPE_LABELS[t.msg.type]} ⟶ n${t.msg.to} bloqueado (${t.reason})`, color: "#ff6b6b" };
    case "log":
      return { text: t.text, color: t.level === "warn" ? "#ffb74d" : undefined };
    default:
      return null; // recv, mutex, coordinator, election: redundantes → fora do log
  }
}

export function EventLog({ events }: Props) {
  const recent = events
    .slice(-500)
    .map((e) => ({ e, d: describe(e.t) }))
    .filter((x): x is { e: LogEntry; d: { text: string; color?: string } } => x.d !== null)
    .slice(-350)
    .reverse(); // mais novo no topo

  return (
    <div className="event-log">
      {recent.map(({ e, d }) => {
        const nc = nodeColor(e.t.nodeId);
        return (
          <div className="log-line" key={e.seq} style={{ borderLeft: `3px solid ${nc}` }}>
            <span className="log-node" style={{ color: nc }}>
              ● n{e.t.nodeId}
            </span>
            <span className="log-ts">@{e.t.lamport}</span>
            <span className="log-text" style={d.color ? { color: d.color } : undefined}>
              {d.text}
            </span>
          </div>
        );
      })}
      {recent.length === 0 && <div className="log-empty">sem eventos ainda…</div>}
    </div>
  );
}
