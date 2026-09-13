import https from "node:https";
import { performance } from "node:perf_hooks";

const target = process.argv[2];
if (!target)
  throw new Error("Usage: node web-readers.mjs WEB_IP [seconds-per-stage]");
const seconds = Number(process.argv[3] ?? 30);
const paths = [
  "/",
  "/research-room",
  "/research-room/98fed1eb-a4a9-4cb8-9da2-95d907d3327a",
];
const agent = new https.Agent({ keepAlive: true, maxSockets: 200 });
function request(path) {
  return new Promise((resolve) => {
    const started = performance.now();
    const req = https.get(
      {
        hostname: target,
        servername: "stocksembly.com",
        path,
        headers: { Host: "stocksembly.com" },
        agent,
        timeout: 8000,
      },
      (res) => {
        res.resume();
        res.once("end", () =>
          resolve({
            ms: performance.now() - started,
            ok: res.statusCode === 200,
          }),
        );
        res.once("error", () =>
          resolve({ ms: performance.now() - started, ok: false }),
        );
      },
    );
    req.on("timeout", () => req.destroy());
    req.on("error", () =>
      resolve({ ms: performance.now() - started, ok: false }),
    );
  });
}
try {
  for (const users of [25, 50, 100, 200]) {
    const results = [];
    const deadline = performance.now() + seconds * 1000;
    let halt = false;
    await Promise.all(
      Array.from({ length: users }, async (_, user) => {
        let count = 0;
        await new Promise((r) => setTimeout(r, user * 10));
        while (performance.now() < deadline && !halt) {
          results.push(await request(paths[(user + count++) % paths.length]));
          if (
            results.length >= 50 &&
            results.filter((r) => !r.ok).length / results.length > 0.02
          )
            halt = true;
          await new Promise((r) => setTimeout(r, 3000));
        }
      }),
    );
    const sorted = results.map((r) => r.ms).sort((a, b) => a - b);
    console.log(
      JSON.stringify({
        users,
        seconds,
        requests: results.length,
        errors: results.filter((r) => !r.ok).length,
        p50Ms: Math.round(sorted[Math.floor(sorted.length * 0.5)] ?? 0),
        p95Ms: Math.round(sorted[Math.floor(sorted.length * 0.95)] ?? 0),
        halted: halt,
        thinkTimeMs: 3000,
      }),
    );
    if (halt) break;
    await new Promise((r) => setTimeout(r, 5000));
  }
} finally {
  agent.destroy();
}
