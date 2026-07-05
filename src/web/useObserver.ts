import { useCallback, useEffect, useRef, useState } from "react";
import type { Command, NodeId, NodeView, Telemetry } from "../shared/types";
import type { LogEntry, ServerMessage, UINode } from "./types";

const OBSERVER_URL = `ws://${location.hostname}:8080/?role=browser`;
const MAX_EVENTS = 3000;

function blankNode(id: NodeId): UINode {
  return { id, alive: true, lamport: 0, mutex: "released", coordinator: null, inElection: false, connectedPeers: [], queue: [] };
}

function fromView(v: NodeView): UINode {
  return { ...v, queue: [] };
}

function reduce(nodes: Map<NodeId, UINode>, t: Telemetry): Map<NodeId, UINode> {
  const next = new Map(nodes);
  const cur = next.get(t.nodeId) ?? blankNode(t.nodeId);
  const n: UINode = { ...cur, lamport: t.lamport };
  switch (t.kind) {
    case "node_up":
      n.alive = true;
      n.coordinator = t.coordinator;
      break;
    case "node_down":
      n.alive = false;
      break;
    case "mutex":
      n.mutex = t.state;
      n.queue = t.queue;
      break;
    case "coordinator":
      n.coordinator = t.coordinator;
      break;
    case "election":
      n.inElection = t.phase === "started";
      break;
  }
  next.set(t.nodeId, n);
  return next;
}

export interface ObserverApi {
  connected: boolean;
  nodes: UINode[];
  events: LogEntry[];
  send: (cmd: Command) => void;
}

export function useObserver(): ObserverApi {
  const [connected, setConnected] = useState(false);
  const [nodesMap, setNodesMap] = useState<Map<NodeId, UINode>>(new Map());
  const [events, setEvents] = useState<LogEntry[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let closed = false;
    let ws: WebSocket;

    const connect = () => {
      ws = new WebSocket(OBSERVER_URL);
      wsRef.current = ws;
      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        if (!closed) setTimeout(connect, 800);
      };
      ws.onmessage = (ev) => {
        let m: ServerMessage;
        try {
          m = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (m.type === "reset") {
          setNodesMap(new Map());
          setEvents([]);
        } else if (m.type === "snapshot") {
          let map = new Map<NodeId, UINode>();
          for (const v of m.nodes) map.set(v.id, fromView(v));
          for (const e of m.events) map = reduce(map, e.t);
          setNodesMap(map);
          setEvents(m.events.slice(-MAX_EVENTS));
        } else if (m.type === "event") {
          setNodesMap((prev) => reduce(prev, m.t));
          setEvents((prev) => {
            const arr = prev.length >= MAX_EVENTS ? prev.slice(prev.length - MAX_EVENTS + 1) : prev.slice();
            arr.push({ seq: m.seq, t: m.t });
            return arr;
          });
        }
      };
    };
    connect();

    return () => {
      closed = true;
      ws?.close();
    };
  }, []);

  const send = useCallback((cmd: Command) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(cmd));
  }, []);

  const nodes = [...nodesMap.values()].sort((a, b) => a.id - b.id);
  return { connected, nodes, events, send };
}
