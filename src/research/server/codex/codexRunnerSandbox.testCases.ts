import { constants } from "node:fs";
import { access, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCodexArgv, CODEX_RUNTIME_POLICY } from "./codexPolicy";
import { executeSpawn } from "./codexProcess";
import { makeCodexTempDirectory } from "./codexRunnerTestSupport";
import { buildSandboxProfile } from "./codexSandbox";

export function registerSandboxTests(): void {
  describe("outer Codex sandbox", () => {
    it("allows only the exact loopback proxy port at the kernel boundary", async () => {
      // Given
      const listen = async (): Promise<Server> => {
        const server = createServer((socket) => socket.end());
        await new Promise<void>((resolve, reject) => {
          server.once("error", reject);
          server.listen(0, "127.0.0.1", () => resolve());
        });
        return server;
      };
      const allowed = await listen();
      const denied = await listen();
      const allowedAddress = allowed.address();
      const deniedAddress = denied.address();
      if (
        allowedAddress === null ||
        typeof allowedAddress === "string" ||
        deniedAddress === null ||
        typeof deniedAddress === "string"
      )
        throw new TypeError("missing test server address");
      const fixture = await makeCodexTempDirectory();
      const profile = buildSandboxProfile({
        codexLink: "/usr/bin/nc",
        codexOrigin: "/usr/bin/nc",
        schemaPath: "/etc/ssl/cert.pem",
        attemptRoot: fixture.path,
        runtimePaths: [fixture.path],
        certificatePath: "/etc/ssl/cert.pem",
        protectedHome: homedir(),
        networkProxyPort: allowedAddress.port,
      });
      const invocation = (port: number) =>
        ({
          executable: "/usr/bin/sandbox-exec",
          argv: ["-p", profile, "/usr/bin/nc", "-z", "127.0.0.1", String(port)],
          cwd: fixture.path,
          environment: {
            CODEX_HOME: fixture.path,
            HOME: fixture.path,
            LANG: "en_US.UTF-8",
            LC_ALL: "en_US.UTF-8",
            NO_COLOR: "1",
            PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
            SSL_CERT_FILE: "/etc/ssl/cert.pem",
            TMPDIR: fixture.path,
          },
          stdin: "",
          timeoutMs: 5_000,
          killGraceMs: 500,
        }) as const;

      try {
        // When
        const allowedResult = await executeSpawn(
          invocation(allowedAddress.port),
        );
        const deniedResult = await executeSpawn(invocation(deniedAddress.port));

        // Then
        expect(allowedResult.exitCode).toBe(0);
        expect(deniedResult.exitCode).not.toBe(0);
      } finally {
        await Promise.all([
          new Promise<void>((resolve) => allowed.close(() => resolve())),
          new Promise<void>((resolve) => denied.close(() => resolve())),
        ]);
        await fixture.cleanup();
      }
    });

    it("allows native provider transport while keeping browsing stage-bound", () => {
      // Given
      const input = {
        codexLink: "/tmp/attempt/codex-bin",
        codexOrigin: "/Applications/ChatGPT.app/Contents/Resources/codex",
        schemaPath: "/tmp/attempt/output-schema.json",
        attemptRoot: "/tmp/attempt",
        runtimePaths: ["/tmp/attempt/runtime"],
        certificatePath: "/etc/ssl/cert.pem",
        protectedHome: "/Users/example",
      };

      // When
      const memoProfile = buildSandboxProfile({
        ...input,
        allowNetwork: true,
      });
      const chairProfile = buildSandboxProfile({
        ...input,
        allowNetwork: true,
      });

      // Then
      expect(CODEX_RUNTIME_POLICY.browsingByStage.memo).toBe("audited_web");
      expect(CODEX_RUNTIME_POLICY.browsingByStage.chair_synthesis).toBe(
        "disabled",
      );
      expect(buildCodexArgv(input.schemaPath, "memo")).toContain(
        'web_search="live"',
      );
      expect(
        buildCodexArgv(input.schemaPath, "chair_synthesis"),
      ).toContain('web_search="disabled"');
      expect(memoProfile).toContain("(allow network-outbound)");
      expect(chairProfile).toContain("(allow network-outbound)");
    });

    it("uses a deny-by-default profile", () => {
      // Given
      const input = {
        codexLink: "/tmp/attempt/codex-bin",
        codexOrigin: "/Applications/ChatGPT.app/Contents/Resources/codex",
        schemaPath: "/tmp/attempt/output-schema.json",
        attemptRoot: "/tmp/attempt",
        runtimePaths: [
          "/tmp/attempt/codex-home",
          "/tmp/attempt/home",
          "/tmp/attempt/tmp",
        ],
        certificatePath: "/etc/ssl/cert.pem",
        protectedHome: "/Users/example",
      };

      // When
      const profile = buildSandboxProfile(input);

      // Then
      expect(profile).toContain("(deny default)");
      expect(profile).not.toContain("(allow default)");
      expect(profile).not.toContain('(import "system.sb")');
      expect(profile).not.toContain("(allow network*)");
    });

    it("limits explicit readable data to the locked system paths", () => {
      // Given
      const profile = buildSandboxProfile({
        codexLink: "/tmp/attempt/codex-bin",
        codexOrigin: "/Applications/ChatGPT.app/Contents/Resources/codex",
        schemaPath: "/tmp/attempt/output-schema.json",
        attemptRoot: "/tmp/attempt",
        runtimePaths: [
          "/tmp/attempt/codex-home",
          "/tmp/attempt/home",
          "/tmp/attempt/tmp",
        ],
        certificatePath: "/etc/ssl/cert.pem",
        protectedHome: "/Users/example",
      });

      // Then
      for (const forbidden of [
        "/Library",
        "/usr",
        "/bin",
        "/sbin",
        "/private/etc",
        "/private/var/db",
        "/dev",
      ])
        expect(profile).not.toContain(`(subpath "${forbidden}")`);
      for (const allowed of [
        "/System",
        "/usr/lib",
        "/usr/share/zoneinfo",
        "/etc/ssl",
        "/private/etc/ssl",
      ])
        expect(profile).toContain(`(subpath "${allowed}")`);
      expect(profile).toContain('(literal "/dev/null")');
      expect(profile).toContain('(literal "/dev/urandom")');
    });

    it("denies real system, device, project, and original-home reads", async () => {
      // Given
      const fixture = await makeCodexTempDirectory();
      const libraryFile =
        "/Library/Apple/System/Library/CoreServices/XProtect.bundle/Contents/Info.plist";
      const passwordFile = "/private/etc/passwd";
      const projectSentinel = join(
        process.cwd(),
        ".omo/evidence/start-work/live-research-office/task-17/sandbox-project-sentinel",
      );
      const homeSentinel = join(
        homedir(),
        `.stocksembly-codex-sandbox-sentinel-${process.pid}`,
      );
      const schemaPath = join(fixture.path, "schema.json");
      await access(libraryFile, constants.R_OK);
      await access(passwordFile, constants.R_OK);
      await access("/dev/zero", constants.R_OK);
      await writeFile(projectSentinel, "project-sentinel", {
        flag: "wx",
        mode: 0o600,
      });
      await writeFile(homeSentinel, "home-sentinel", {
        flag: "wx",
        mode: 0o600,
      });
      await writeFile(schemaPath, "{}", { flag: "wx", mode: 0o600 });
      const regularProfile = buildSandboxProfile({
        codexLink: "/bin/cat",
        codexOrigin: "/bin/cat",
        schemaPath,
        attemptRoot: fixture.path,
        runtimePaths: [fixture.path],
        certificatePath: "/etc/ssl/cert.pem",
        protectedHome: homedir(),
      });
      const zeroProfile = buildSandboxProfile({
        codexLink: "/usr/bin/head",
        codexOrigin: "/usr/bin/head",
        schemaPath,
        attemptRoot: fixture.path,
        runtimePaths: [fixture.path],
        certificatePath: "/etc/ssl/cert.pem",
        protectedHome: homedir(),
      });
      const environment = {
        CODEX_HOME: fixture.path,
        HOME: fixture.path,
        LANG: "en_US.UTF-8",
        LC_ALL: "en_US.UTF-8",
        NO_COLOR: "1",
        PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
        SSL_CERT_FILE: "/etc/ssl/cert.pem",
        TMPDIR: fixture.path,
      } as const;

      try {
        // When
        const results = await Promise.all(
          [libraryFile, passwordFile, projectSentinel, homeSentinel].map(
            async (protectedPath) =>
              await executeSpawn({
                executable: "/usr/bin/sandbox-exec",
                argv: ["-p", regularProfile, "/bin/cat", protectedPath],
                cwd: fixture.path,
                environment,
                stdin: "",
                timeoutMs: 5_000,
                killGraceMs: 500,
              }),
          ),
        );
        const zeroResult = await executeSpawn({
          executable: "/usr/bin/sandbox-exec",
          argv: ["-p", zeroProfile, "/usr/bin/head", "-c", "1", "/dev/zero"],
          cwd: fixture.path,
          environment,
          stdin: "",
          timeoutMs: 5_000,
          killGraceMs: 500,
        });

        // Then
        expect(
          [...results, zeroResult].map((result) => result.exitCode),
        ).toEqual([1, 1, 1, 1, 1]);
        expect(
          [...results, zeroResult].flatMap((result) => result.stdout),
        ).toHaveLength(0);
      } finally {
        await rm(projectSentinel, { force: true });
        await rm(homeSentinel, { force: true });
        await fixture.cleanup();
      }
    });
  });
}
