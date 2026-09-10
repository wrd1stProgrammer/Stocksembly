import { describe, expect, it } from "vitest";
import {
  CodexStderrAuthenticationDetector,
  codexStdoutAuthenticationFailure,
} from "./codexAuthenticationFailure";
import { executeSpawn } from "./codexProcess";
import { runCodexWithPlatform } from "./codexRunnerCore";
import { makePlatform, runInput } from "./codexRunnerPortTestSupport";

describe("Codex authentication failure classification", () => {
  it.each([
    "Your refresh token has already been used. Please log in again.",
    "refresh_token_reused",
    "The access token has expired",
    "Authentication required",
    "unexpected status 401 Unauthorized",
    "Incorrect API key provided",
  ])("recognizes an authentication error event: %s", (message) => {
    expect(
      codexStdoutAuthenticationFailure(
        JSON.stringify({
          type: "turn.failed",
          error: { message },
        }),
      ),
    ).toBe(true);
  });

  it.each([
    {
      type: "item.completed",
      item: {
        type: "agent_message",
        text: "Authentication required. HTTP 401. Please log in again.",
      },
    },
    {
      type: "turn.failed",
      error: { message: "Too many requests: status 429" },
    },
    { type: "error", message: "Connection reset, HTTP 503" },
    { type: "error", message: "There are 401 authentication providers" },
  ])(
    "does not treat model prose or unrelated failures as lost login",
    (event) => {
      expect(codexStdoutAuthenticationFailure(JSON.stringify(event))).toBe(
        false,
      );
    },
  );

  it("maps a stderr-only authentication failure through the real runner boundary", async () => {
    const fixture = await makePlatform();
    try {
      const platform = {
        ...fixture.platform,
        async runCodex() {
          return {
            exitCode: 1,
            stdout: [],
            stderrBytes: 50,
            authenticationFailure: true,
          };
        },
      };
      await expect(
        runCodexWithPlatform(
          runInput(fixture.attemptDir),
          platform,
          fixture.reservations,
        ),
      ).rejects.toMatchObject({ code: "auth_unavailable" });
    } finally {
      await fixture.root.cleanup();
    }
  });

  it("recognizes an auth diagnostic split across stderr chunks", () => {
    const detector = new CodexStderrAuthenticationDetector();
    detector.feed(Buffer.from("ERROR: refresh_token_"));
    expect(detector.failed).toBe(false);
    detector.feed(Buffer.from("reused"));
    expect(detector.failed).toBe(true);
  });

  it("reports a safe auth flag from a failing process without exposing stderr", async () => {
    const execution = await executeSpawn({
      executable: process.execPath,
      cwd: process.cwd(),
      environment: { PATH: "/usr/bin:/bin" },
      argv: [
        "-e",
        "process.stderr.write('ERROR: refresh_token_reused secret-must-stay-private'); process.exitCode = 1;",
      ],
      stdin: "",
      timeoutMs: 2_000,
      inactivityTimeoutMs: 2_000,
      killGraceMs: 50,
    });
    expect(execution).toMatchObject({
      exitCode: 1,
      authenticationFailure: true,
    });
    expect(JSON.stringify(execution)).not.toContain("secret-must-stay-private");
    expect(execution.stderrBytes).toBeGreaterThan(0);
  });
});
