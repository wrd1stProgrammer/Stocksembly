import { describe, expect, it } from "vitest";
import { acquisitionChannel } from "./acquisitionAttribution";

const capturedAt = "2026-08-20T00:00:00.000Z";

describe("acquisitionChannel", () => {
  it("classifies the recommended Threads UTM as social", () => {
    expect(
      acquisitionChannel({
        source: "threads",
        medium: "organic_social",
        campaign: "threads_profile",
        content: "bio_link",
        landingPath: "/",
        capturedAt,
      }),
    ).toBe("social");
  });

  it("recognizes Threads referrers without UTM parameters", () => {
    expect(
      acquisitionChannel({
        referrerHost: "www.threads.net",
        landingPath: "/pricing",
        capturedAt,
      }),
    ).toBe("social");
  });
});
