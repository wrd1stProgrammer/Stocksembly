import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

it("keeps local paths when the CDN is disabled", async () => {
  vi.stubEnv("NEXT_PUBLIC_STATIC_ASSET_BASE_URL", "");
  const { staticAsset } = await import("./staticAsset");
  expect(staticAsset("/research/office-v8/base.png")).toBe(
    "/research/office-v8/base.png",
  );
});

it("rewrites only the published public asset versions", async () => {
  vi.stubEnv(
    "NEXT_PUBLIC_STATIC_ASSET_BASE_URL",
    "https://cdn.example/releases/sha/",
  );
  const { staticAsset } = await import("./staticAsset");
  expect(staticAsset("/research/office-v10/agents/market.png")).toBe(
    "https://cdn.example/releases/sha/research/office-v10/agents/market.png",
  );
  for (const path of [
    "/api/research/report",
    "/research/office-v11/base.png",
    "/research/NVDA",
    "https://example.com/image.png",
  ])
    expect(staticAsset(path)).toBe(path);
});
