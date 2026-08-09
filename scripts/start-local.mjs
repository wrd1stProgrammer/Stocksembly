import { spawn } from "node:child_process";

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const productionSyncConfigured = Boolean(
  process.env.STOCKSEMBLY_PRODUCTION_SYNC_HOST &&
    process.env.STOCKSEMBLY_PRODUCTION_SYNC_SSH_KEY,
);
const serviceScripts = [
  "start:web",
  "start:worker",
  ...(productionSyncConfigured ? ["research:production-sync"] : []),
];
const children = serviceScripts.map((script) =>
  spawn(pnpm, [script], {
    env: process.env,
    stdio: "inherit",
  }),
);
let stopping = false;

function stop(signal) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null)
      child.kill(signal);
  }
}

process.once("SIGINT", () => stop("SIGINT"));
process.once("SIGTERM", () => stop("SIGTERM"));

const exits = children.map(
  (child, index) =>
    new Promise((resolve) => {
      child.once("error", () =>
        resolve({ service: serviceScripts[index], code: 1 }),
      );
      child.once("exit", (code) =>
        resolve({ service: serviceScripts[index], code: code ?? 1 }),
      );
    }),
);

const firstExit = await Promise.race(exits);
if (!stopping) {
  process.stderr.write(
    `${firstExit.service} exited with code ${firstExit.code}; stopping local services.\n`,
  );
  process.exitCode = firstExit.code;
  stop("SIGTERM");
}
await Promise.all(exits);
