import { type SpawnOptionsWithoutStdio, spawn } from "node:child_process";
import { CodexRunnerError } from "./codexErrors";
import { nodeSpawnEnvironment } from "./codexProcess";
import type { SpawnInvocation } from "./codexTypes";

export type CodeSignature = {
  readonly identifier: string;
  readonly teamIdentifier: string;
  readonly codeDirectoryHash: string;
};

async function runCodesign(
  argv: readonly string[],
  environment: SpawnInvocation["environment"],
  captureDetails: boolean,
): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const options: SpawnOptionsWithoutStdio = {
      env: nodeSpawnEnvironment(environment),
      shell: false,
      windowsHide: true,
    };
    const child = spawn("/usr/bin/codesign", [...argv], options);
    const details: Buffer[] = [];
    let detailBytes = 0;
    child.stderr.on("data", (chunk: Buffer) => {
      detailBytes += chunk.byteLength;
      if (captureDetails && detailBytes <= 16 * 1_024)
        details.push(Buffer.from(chunk));
    });
    child.stdout.resume();
    child.once("error", () => reject(new CodexRunnerError("origin_untrusted")));
    child.once("close", (code: number | null) => {
      if (code !== 0 || detailBytes > 16 * 1_024) {
        reject(new CodexRunnerError("origin_untrusted"));
        return;
      }
      resolve(Buffer.concat(details).toString("utf8"));
    });
  });
}

function field(details: string, name: string): string {
  const line = details
    .split("\n")
    .find((candidate) => candidate.startsWith(`${name}=`));
  if (line === undefined) throw new CodexRunnerError("origin_untrusted");
  return line.slice(name.length + 1);
}

export async function inspectCodeSignature(
  path: string,
  environment: SpawnInvocation["environment"],
): Promise<CodeSignature> {
  await runCodesign(
    ["--verify", "--strict", "--verbose=0", path],
    environment,
    false,
  );
  const details = await runCodesign(
    ["-d", "--verbose=4", path],
    environment,
    true,
  );
  return Object.freeze({
    identifier: field(details, "Identifier"),
    teamIdentifier: field(details, "TeamIdentifier"),
    codeDirectoryHash: field(details, "CDHash"),
  });
}
