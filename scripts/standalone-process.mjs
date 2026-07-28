import { spawn, spawnSync } from "node:child_process";
import { request } from "node:http";
import { createServer } from "node:net";

export class ProcessVerificationError extends Error {
  name = "ProcessVerificationError";

  constructor(code, message, options) {
    super(message, options);
    this.code = code;
  }
}

export const runProcess = (command, argumentsValue, options) =>
  spawnSync(command, argumentsValue, {
    cwd: options.cwd,
    env: options.env,
    encoding: "utf8",
    timeout: options.timeout ?? 30_000,
    maxBuffer: 2_097_152,
  });

export const startProcess = (command, argumentsValue, options) => {
  const child = spawn(command, argumentsValue, {
    cwd: options.cwd,
    env: options.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  return child;
};

export const waitForJsonLine = (child, schema, timeoutMs = 30_000) =>
  new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      finish(
        new ProcessVerificationError(
          "PROCESS_READY_TIMEOUT",
          `Process readiness timed out: ${stderr.trim()}`,
        ),
      );
    }, timeoutMs);
    const onStdout = (chunk) => {
      stdout += chunk;
      for (const line of stdout.split("\n")) {
        if (line.trim() === "") continue;
        try {
          const parsed = schema.safeParse(JSON.parse(line));
          if (parsed.success) {
            finish(undefined, parsed.data);
            return;
          }
        } catch (error) {
          if (!(error instanceof SyntaxError)) throw error;
        }
      }
    };
    const onStderr = (chunk) => {
      stderr += chunk;
    };
    const onExit = (code) => {
      finish(
        new ProcessVerificationError(
          "PROCESS_EXITED_BEFORE_READY",
          `Process exited ${String(code)} before readiness: ${stderr.trim()}`,
        ),
      );
    };
    const finish = (error, value) => {
      clearTimeout(timer);
      child.stdout.off("data", onStdout);
      child.stderr.off("data", onStderr);
      child.off("exit", onExit);
      if (error === undefined) resolve(value);
      else reject(error);
    };
    child.stdout.on("data", onStdout);
    child.stderr.on("data", onStderr);
    child.once("exit", onExit);
  });

export const waitForHttp = async (port, timeoutMs = 30_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = await new Promise((resolve) => {
      const call = request(
        { host: "127.0.0.1", port, path: "/", method: "GET", timeout: 500 },
        (response) => {
          response.resume();
          resolve(response.statusCode ?? 0);
        },
      );
      call.on("error", () => resolve(0));
      call.on("timeout", () => {
        call.destroy();
        resolve(0);
      });
      call.end();
    });
    if (status >= 200 && status < 500) return status;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new ProcessVerificationError(
    "WEB_READY_TIMEOUT",
    "The loopback web process did not become ready",
  );
};

export const stopProcess = async (child) => {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill("SIGTERM");
  const timeout = new Promise((resolve) =>
    setTimeout(() => resolve("timeout"), 5_000),
  );
  if ((await Promise.race([exited, timeout])) === "timeout") {
    child.kill("SIGKILL");
    await exited;
  }
};

export const reserveLoopbackPort = () =>
  new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close();
        reject(new ProcessVerificationError("PORT_UNAVAILABLE", "No port"));
        return;
      }
      server.close((error) => {
        if (error === undefined) resolve(address.port);
        else reject(error);
      });
    });
  });
