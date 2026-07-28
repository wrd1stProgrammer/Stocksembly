import { constants } from "node:fs";
import { chmod, mkdir, open, realpath, rm } from "node:fs/promises";
import { join } from "node:path";
import { CodexRunnerError } from "./codexErrors";

const MAX_AUTH_BYTES = 64 * 1_024;

export type EphemeralCodexRuntime = {
  readonly root: string;
  readonly home: string;
  readonly userHome: string;
  readonly temp: string;
  readonly cleanup: () => Promise<void>;
};

async function copyAuthDescriptor(
  sourcePath: string,
  targetPath: string,
): Promise<void> {
  const source = await open(
    sourcePath,
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );
  try {
    const before = await source.stat({ bigint: true });
    if (
      !before.isFile() ||
      before.size <= 0n ||
      before.size > BigInt(MAX_AUTH_BYTES) ||
      (before.mode & 0o777n) !== 0o600n ||
      before.uid !== BigInt(process.getuid?.() ?? -1)
    )
      throw new CodexRunnerError("auth_unavailable");
    const target = await open(
      targetPath,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
      0o600,
    );
    try {
      const buffer = Buffer.allocUnsafe(8 * 1_024);
      let position = 0;
      for (;;) {
        const { bytesRead } = await source.read(
          buffer,
          0,
          buffer.byteLength,
          position,
        );
        if (bytesRead === 0) break;
        await target.write(buffer, 0, bytesRead, position);
        position += bytesRead;
      }
      buffer.fill(0);
      await target.sync();
    } finally {
      await target.close();
    }
    const after = await source.stat({ bigint: true });
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      before.ctimeNs !== after.ctimeNs
    )
      throw new CodexRunnerError("auth_unavailable");
  } finally {
    await source.close();
  }
}

export async function prepareEphemeralRuntime(
  authPath: string,
  attemptDir: string,
): Promise<EphemeralCodexRuntime> {
  const paths: string[] = [];
  try {
    const root = await realpath(attemptDir);
    const home = join(root, "codex-home");
    const userHome = join(root, "home");
    const temp = join(root, "tmp");
    await mkdir(home, { mode: 0o700 });
    paths.push(home);
    await mkdir(userHome, { mode: 0o700 });
    paths.push(userHome);
    await mkdir(temp, { mode: 0o700 });
    paths.push(temp);
    await chmod(home, 0o700);
    await chmod(userHome, 0o700);
    await chmod(temp, 0o700);
    await copyAuthDescriptor(authPath, join(home, "auth.json"));
    return Object.freeze({
      root,
      home,
      userHome,
      temp,
      async cleanup() {
        await Promise.all(
          [home, userHome, temp].map(
            async (path) => await rm(path, { recursive: true, force: true }),
          ),
        );
      },
    });
  } catch (error) {
    await Promise.all(
      paths.map(
        async (path) => await rm(path, { recursive: true, force: true }),
      ),
    );
    if (error instanceof CodexRunnerError) throw error;
    throw new CodexRunnerError("auth_unavailable");
  }
}
