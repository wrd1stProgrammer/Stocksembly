import { afterEach, describe, expect, it, vi } from "vitest";
import BriefingPreviewPage from "./page";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("briefing preview route", () => {
  it("returns not found in production instead of an empty soft-404 page", async () => {
    vi.stubEnv("NODE_ENV", "production");

    await expect(BriefingPreviewPage()).rejects.toThrow();
  });
});
