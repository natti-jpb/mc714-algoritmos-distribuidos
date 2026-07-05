import { spawn, type ChildProcess } from "node:child_process";
import { CLUSTER_SIZE } from "./config";

// Sobe o observer + CLUSTER_SIZE nós, cada um em seu PRÓPRIO PROCESSO.
// (No Docker Compose, cada um vira um contêiner; aqui são processos locais
//  em portas distintas — em ambos os casos a troca de mensagens é via rede real.)

const TSX = process.platform === "win32" ? "node_modules\\.bin\\tsx.cmd" : "node_modules/.bin/tsx";
const children: ChildProcess[] = [];

function prefixLines(prefix: string, text: string): string {
  return text
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => `${prefix} ${l}\n`)
    .join("");
}

function launch(name: string, file: string, env: Record<string, string>): void {
  const child = spawn(TSX, [file], {
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
  });
  children.push(child);
  child.stdout?.on("data", (d: Buffer) => process.stdout.write(prefixLines(`[${name}]`, d.toString())));
  child.stderr?.on("data", (d: Buffer) => process.stderr.write(prefixLines(`[${name}!]`, d.toString())));
  child.on("exit", (code) => console.log(`[launcher] ${name} saiu (code=${code})`));
}

console.log(`[launcher] subindo observer + ${CLUSTER_SIZE} nós...`);
launch("observer", "src/observer/index.ts", {});

// Dá um tempo para o observer subir antes dos nós conectarem.
setTimeout(() => {
  for (let id = 0; id < CLUSTER_SIZE; id++) {
    launch(`no${id}`, "src/node/index.ts", { NODE_ID: String(id) });
  }
}, 700);

function shutdown(): void {
  console.log("\n[launcher] encerrando...");
  for (const c of children) c.kill("SIGTERM");
  setTimeout(() => process.exit(0), 300);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
