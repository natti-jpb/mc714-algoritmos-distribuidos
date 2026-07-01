import type { Telemetry } from "../../shared/types";
import type { LogEntry } from "../types";
import { isCausal, TYPE_COLORS, TYPE_LABELS } from "../theme";

interface Props {
  events: LogEntry[];
  showHeartbeats: boolean;
}

function describe(t: Telemetry): { text: string; color?: string } {
  switch (t.kind) {
    case "send":
      return { text: `── ${TYPE_LABELS[t.msg.type]} ⟶ n${t.msg.to}`, color: TYPE_COLORS[t.msg.type] };
    case "recv":
      return { text: `n${t.msg.from} ⟶ ${TYPE_LABELS[t.msg.type]} ──`, color: TYPE_COLORS[t.msg.type] };
    case "mutex":
      return { text: `mutex = ${t.state}${t.queue.length ? ` (fila: ${t.queue.join(",")})` : ""}` };
    case "coordinator":
      return { text: `coordenador = n${t.coordinator}`, color: "#5ef0b0" };
    case "election":
      return { text: `eleição: ${t.phase}`, color: "#b18cff" };
    case "event":
      return { text: t.label };
    case "node_up":
      return { text: "NÓ NO AR", color: "#5ef0b0" };
    case "node_down":
      return { text: "CRASH", color: "#ff6b6b" };
    case "blocked":
      return { text: `✗ ${TYPE_LABELS[t.msg.type]} ⟶ n${t.msg.to} bloqueado (${t.reason})`, color: "#ff6b6b" };
    case "log":
      return { text: t.text, color: t.level === "warn" ? "#ffb74d" : undefined };
  }
}

function isHeartbeat(t: Telemetry): boolean {
  return (t.kind === "send" || t.kind === "recv" || t.kind === "blocked") && !isCausal(t.msg.type);
}

export function EventLog({ events, showHeartbeats }: Props) {
  const filtered = events.filter((e) => showHeartbeats || !isHeartbeat(e.t));
  const recent = filtered.slice(-400).reverse(); // mais novo no topo

  return (
    <div className="event-log">
      {recent.map((e) => {
        const d = describe(e.t);
        return (
          <div className="log-line" key={e.seq}>
            <span className="log-node">n{e.t.nodeId}</span>
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
