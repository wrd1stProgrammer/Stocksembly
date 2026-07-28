import { createHash } from "node:crypto";
import { constants } from "node:fs";
import {
  chmod,
  link,
  lstat,
  mkdir,
  readFile,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CodexRunnerError } from "./codexErrors";
import {
  protectCodexOrigin,
  sha256File,
  verifyPinnedRegularFile,
} from "./codexOrigin";
import { makeCodexTempDirectory } from "./codexRunnerTestSupport";

async function makeOrigin(
  root: string,
  contents = "fake-codex",
): Promise<string> {
  const origin = join(root, "origin-bin");
  await writeFile(origin, contents, { mode: 0o755, flag: "wx" });
  await chmod(origin, 0o755);
  return origin;
}

export function registerOriginTests(): void {
  describe("protected Codex origin", () => {
    it("creates an exclusive same-inode link in a 0700 attempt directory", async () => {
      // Given
      const fixture = await makeCodexTempDirectory();
      const origin = await makeOrigin(fixture.path);
      const expectedHash = await sha256File(origin, "origin_untrusted");
      const attemptDir = join(fixture.path, "attempt");

      // When
      const protectedOrigin = await protectCodexOrigin({
        originPath: origin,
        expectedHash,
        attemptDir,
      });

      // Then
      expect(protectedOrigin.origin.inode).toBe(protectedOrigin.link.inode);
      expect(protectedOrigin.origin.device).toBe(protectedOrigin.link.device);
      expect(protectedOrigin.origin.hash).toBe(protectedOrigin.link.hash);
      expect((await lstat(attemptDir)).mode & 0o777).toBe(0o700);
      await fixture.cleanup();
    });

    it("rejects a symlink origin before linking", async () => {
      // Given
      const fixture = await makeCodexTempDirectory();
      const target = await makeOrigin(fixture.path);
      const origin = join(fixture.path, "origin-link");
      await symlink(target, origin);

      // When
      const action = protectCodexOrigin({
        originPath: origin,
        expectedHash: await sha256File(target, "origin_untrusted"),
        attemptDir: join(fixture.path, "attempt"),
      });

      // Then
      await expect(action).rejects.toMatchObject({ code: "origin_untrusted" });
      await fixture.cleanup();
    });

    it("detects an origin swap between descriptor verification and link", async () => {
      // Given
      const fixture = await makeCodexTempDirectory();
      const origin = await makeOrigin(fixture.path, "trusted");
      const replacement = join(fixture.path, "replacement");
      await writeFile(replacement, "replacement", { mode: 0o755, flag: "wx" });
      const expectedHash = await sha256File(origin, "origin_untrusted");

      // When
      const action = protectCodexOrigin({
        originPath: origin,
        expectedHash,
        attemptDir: join(fixture.path, "attempt"),
        async beforeLink() {
          await import("node:fs/promises").then(({ rename }) =>
            rename(replacement, origin),
          );
        },
      });

      // Then
      await expect(action).rejects.toMatchObject({ code: "link_untrusted" });
      await fixture.cleanup();
    });

    it("keeps the verified origin descriptor open through hard-link creation", async () => {
      // Given
      const fixture = await makeCodexTempDirectory();
      const origin = await makeOrigin(fixture.path);
      const expectedHash = await sha256File(origin, "origin_untrusted");
      let descriptorWasOpen = false;

      // When
      await protectCodexOrigin({
        originPath: origin,
        expectedHash,
        attemptDir: join(fixture.path, "attempt"),
        async beforeLink(descriptor) {
          const expected = await stat(origin, { bigint: true });
          const observed = await descriptor.stat({ bigint: true });
          descriptorWasOpen =
            observed.dev === expected.dev && observed.ino === expected.ino;
        },
      });

      // Then
      expect(descriptorWasOpen).toBe(true);
      await fixture.cleanup();
    });

    it("rejects a pinned regular certificate that is not root-owned", async () => {
      // Given
      const fixture = await makeCodexTempDirectory();
      const certificate = join(fixture.path, "cert.pem");
      await writeFile(certificate, "certificate", { mode: 0o644, flag: "wx" });
      const hash = createHash("sha256")
        .update(await readFile(certificate))
        .digest("hex");

      // When
      const action = verifyPinnedRegularFile(
        certificate,
        hash,
        "policy_violation",
      );

      // Then
      await expect(action).rejects.toMatchObject({ code: "policy_violation" });
      await fixture.cleanup();
    });

    it("rejects a preexisting link and an EXDEV failure without fallback", async () => {
      // Given
      const fixture = await makeCodexTempDirectory();
      const origin = await makeOrigin(fixture.path);
      const expectedHash = await sha256File(origin, "origin_untrusted");
      const attemptDir = join(fixture.path, "attempt");

      // When
      const preexisting = protectCodexOrigin({
        originPath: origin,
        expectedHash,
        attemptDir,
        async beforeLink() {
          await writeFile(join(attemptDir, "codex-bin"), "occupied", {
            flag: "wx",
          });
        },
      });

      // Then
      await expect(preexisting).rejects.toMatchObject({
        code: "link_untrusted",
      });
      await fixture.cleanup();

      const second = await makeCodexTempDirectory();
      const secondOrigin = await makeOrigin(second.path);
      const exdev = Object.assign(new Error("cross-device"), { code: "EXDEV" });
      await expect(
        protectCodexOrigin({
          originPath: secondOrigin,
          expectedHash: await sha256File(secondOrigin, "origin_untrusted"),
          attemptDir: join(second.path, "attempt"),
          async linkFile() {
            throw exdev;
          },
        }),
      ).rejects.toBeInstanceOf(CodexRunnerError);
      await second.cleanup();
      void constants.O_NOFOLLOW;
      void link;
      void mkdir;
    });
  });
}
