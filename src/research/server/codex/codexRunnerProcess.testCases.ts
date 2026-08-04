import { describe, expect, it } from "vitest";
import { CodexJsonlEarlyGuard } from "./codexJsonl";
import { executeSpawn } from "./codexProcess";

const BASE_INVOCATION = Object.freeze({
  executable: process.execPath,
  cwd: process.cwd(),
  environment: Object.freeze({ NODE_ENV: "test", PATH: "/usr/bin:/bin" }),
  timeoutMs: 2_000,
  inactivityTimeoutMs: 2_000,
  killGraceMs: 50,
});

export function registerProcessTests(): void {
  describe("Codex process boundary", () => {
    it("uses argv and stdin as separate channels without a shell", async () => {
      // Given
      const prompt = "literal; exit 91";
      const program =
        "let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>{if(s!==process.argv[1])process.exit(7);process.stdout.write('ok')})";

      // When
      const result = await executeSpawn({
        ...BASE_INVOCATION,
        argv: ["-e", program, prompt],
        stdin: prompt,
      });

      // Then
      expect(result.exitCode).toBe(0);
      expect(Buffer.concat(result.stdout).toString()).toBe("ok");
    });

    it("reports a process signal without persisting process output", async () => {
      // When
      const result = await executeSpawn({
        ...BASE_INVOCATION,
        argv: ["-e", "process.kill(process.pid, 'SIGTERM')"],
        stdin: "",
      });

      // Then
      expect(result).toMatchObject({
        exitCode: -1,
        signal: "SIGTERM",
        stdoutBytes: 0,
        stderrBytes: 0,
      });
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("terminates the process group on timeout", async () => {
      // Given
      const invocation = {
        ...BASE_INVOCATION,
        argv: ["-e", "setInterval(()=>{},1000)"],
        stdin: "",
        timeoutMs: 30,
      };

      // When
      const action = executeSpawn(invocation);

      // Then
      await expect(action).rejects.toMatchObject({ code: "timeout" });
    });

    it("allows an active process to run without a total deadline", async () => {
      // Given
      const program =
        "let n=0;const timer=setInterval(()=>{process.stdout.write('.');if(++n===12){clearInterval(timer);process.exit(0)}},30)";

      // When
      const result = await executeSpawn({
        ...BASE_INVOCATION,
        argv: ["-e", program],
        stdin: "",
        timeoutMs: undefined,
        inactivityTimeoutMs: 100,
      });

      // Then
      expect(result.exitCode).toBe(0);
      expect(Buffer.concat(result.stdout).toString()).toBe("............");
    });

    it("reclaims a process after the inactivity watchdog expires", async () => {
      // Given
      const invocation = {
        ...BASE_INVOCATION,
        argv: ["-e", "setInterval(()=>{},1000)"],
        stdin: "",
        timeoutMs: undefined,
        inactivityTimeoutMs: 30,
      };

      // When
      const action = executeSpawn(invocation);

      // Then
      await expect(action).rejects.toMatchObject({
        code: "inactivity_timeout",
      });
    });

    it("lets cancellation supersede an inactivity timeout before process exit", async () => {
      // Given
      const controller = new AbortController();
      const action = executeSpawn({
        ...BASE_INVOCATION,
        argv: [
          "-e",
          "process.on('SIGTERM',()=>setTimeout(()=>process.exit(0),50));setInterval(()=>{},1000)",
        ],
        stdin: "",
        timeoutMs: undefined,
        inactivityTimeoutMs: 100,
        signal: controller.signal,
      });

      // When
      setTimeout(() => controller.abort(), 105);

      // Then
      await expect(action).rejects.toMatchObject({ code: "cancelled" });
    });

    it("terminates the process group when cancelled", async () => {
      // Given
      const controller = new AbortController();
      const action = executeSpawn({
        ...BASE_INVOCATION,
        argv: ["-e", "setInterval(()=>{},1000)"],
        stdin: "",
        signal: controller.signal,
      });

      // When
      controller.abort();

      // Then
      await expect(action).rejects.toMatchObject({ code: "cancelled" });
    });

    it("terminates a hanging process immediately after a tool event", async () => {
      // Given
      const guard = new CodexJsonlEarlyGuard();
      const program =
        'process.stdout.write(\'{"type":"item.started","item":{"type":"command_execution"}}\\n\');setInterval(()=>{},1000)';

      // When
      const action = executeSpawn({
        ...BASE_INVOCATION,
        argv: ["-e", program],
        stdin: "",
        onStdoutChunk: (chunk) => guard.feed(chunk),
      });

      // Then
      await expect(action).rejects.toMatchObject({ code: "tool_event" });
    });
  });
}
