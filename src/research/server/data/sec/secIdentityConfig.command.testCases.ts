import { spawn } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

type CommandResult = {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
};

const roots: string[] = [];

function runPackageCommand(options: {
  readonly command: string;
  readonly dataRoot: string;
  readonly input?: string;
}): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", [options.command], {
      cwd: process.cwd(),
      env: { ...process.env, STOCKSEMBLY_DATA_DIR: options.dataRoot },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (exitCode) => {
      resolve({ exitCode: exitCode ?? -1, stdout, stderr });
    });
    child.stdin.end(options.input ?? "");
  });
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("SEC identity package commands", () => {
  it("configures and requires a synthetic identity through the exact package aliases", async () => {
    // Given
    const dataRoot = await mkdtemp(join(tmpdir(), "stocksembly-sec-command-"));
    roots.push(dataRoot);

    // When
    const configured = await runPackageCommand({
      command: "research:configure-sec-identity",
      dataRoot,
      input: "Synthetic Command Lab\ncommand-test@example.invalid\ny\n",
    });
    const required = await runPackageCommand({
      command: "research:require-sec-identity",
      dataRoot,
    });

    // Then
    const configPath = join(dataRoot, "config", "sec-identity.json");
    expect(configured.exitCode).toBe(0);
    expect(configured.stdout).toContain(
      "Stocksembly/1.0 (Synthetic Command Lab; command-test@example.invalid)",
    );
    expect(required.exitCode).toBe(0);
    expect(required.stdout).toMatch(/"identityHash":"[a-f0-9]{64}"/);
    expect(required.stdout).not.toContain("Synthetic Command Lab");
    expect(required.stdout).not.toContain("command-test@example.invalid");
    expect((await stat(join(dataRoot, "config"))).mode & 0o777).toBe(0o700);
    expect((await stat(configPath)).mode & 0o777).toBe(0o600);
  });
});
