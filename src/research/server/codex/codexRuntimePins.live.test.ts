import { execFile } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { protectCodexOrigin, verifyPinnedExecutable } from "./codexOrigin";
import { productionCodexPlatform } from "./codexPlatform";

const executeFile = promisify(execFile);

describe.runIf(process.platform === "darwin")(
  "production Codex runtime pins",
  () => {
    it("pins the canonical signed binary and same-device protected-link topology", async () => {
      // Given
      const platform = productionCodexPlatform();
      const origin = await realpath(platform.pins.originPath);
      const parent = await realpath(
        join(process.cwd(), ".stocksembly-verification"),
      ).catch(async () => {
        await mkdir(join(process.cwd(), ".stocksembly-verification"), {
          recursive: true,
        });
        return await realpath(join(process.cwd(), ".stocksembly-verification"));
      });
      const root = await realpath(
        await mkdtemp(join(parent, "codex-pin-topology-")),
      );

      try {
        // When
        const verified = await verifyPinnedExecutable(
          origin,
          platform.pins.originSha256,
          "origin_untrusted",
        );
        const signature = await platform.inspectSignature(origin, {
          PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
          LANG: platform.pins.locale,
          LC_ALL: platform.pins.locale,
        });
        const protectedOrigin = await protectCodexOrigin({
          originPath: origin,
          expectedHash: platform.pins.originSha256,
          attemptDir: join(root, "attempt"),
        });
        const version = await executeFile(protectedOrigin.linkPath, [
          "--version",
        ]);

        // Then
        expect(origin).toBe(platform.pins.originPath);
        expect(signature).toEqual({
          identifier: platform.pins.codeIdentifier,
          teamIdentifier: platform.pins.teamIdentifier,
          codeDirectoryHash: platform.pins.codeDirectoryHash,
        });
        expect(protectedOrigin.origin).toEqual(verified);
        expect(protectedOrigin.link).toEqual(verified);
        expect(version.stdout.trim()).toBe(platform.pins.version);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  },
);
