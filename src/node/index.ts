import type { PeerInfo } from "../shared/transport";
import { DistributedNode } from "./node";
import { defaultPeers, OBSERVER_URL } from "../config";

// Entrypoint de UM nó (um processo / um contêiner).
// Variáveis de ambiente: NODE_ID, PEERS (JSON), OBSERVER_URL.
const id = Number(process.env.NODE_ID ?? 0);
const peers: PeerInfo[] = process.env.PEERS ? (JSON.parse(process.env.PEERS) as PeerInfo[]) : defaultPeers();
const observerUrl = process.env.OBSERVER_URL ?? OBSERVER_URL;

const node = new DistributedNode(id, peers, observerUrl);
node.start();

const port = peers.find((p) => p.id === id)?.port;
const initialCoord = Math.max(...peers.map((p) => p.id));
console.log(`[nó ${id}] no ar (porta ${port}); coordenador inicial assumido = ${initialCoord}`);

process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
