import { describe, expect, it } from "vitest";
import { isLowSignalBriefingNewsTitle } from "./briefingCollectionPolicy";

describe("briefing news admission policy", () => {
  it("rejects a multi-stock must-own listicle even when it mentions the issuer", () => {
    expect(
      isLowSignalBriefingNewsTitle(
        "These three AI stocks are must-own after SpaceX earnings call",
      ),
    ).toBe(true);
  });
});
