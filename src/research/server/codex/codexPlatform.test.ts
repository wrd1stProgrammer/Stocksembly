import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { productionCodexPlatform } from "./codexPlatform";

describe("production Codex platform", () => {
  it("keeps Linux attempt storage on the pinned binary filesystem", () => {
    const platform = productionCodexPlatform();

    if (process.platform === "linux")
      expect(
        platform.pins.originPath.startsWith(`${platform.tempParent}/`),
      ).toBe(true);
    else expect(platform.tempParent).toBe(tmpdir());
  });
});
