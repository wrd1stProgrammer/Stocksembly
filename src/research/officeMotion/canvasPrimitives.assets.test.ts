import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

it("retries the local original when CDN decoding fails", async () => {
  vi.stubEnv(
    "NEXT_PUBLIC_STATIC_ASSET_BASE_URL",
    "https://cdn.example/releases/sha",
  );
  const attempts: string[] = [];
  class TestImage {
    src = "";
    crossOrigin = "";
    async decode() {
      expect(this.crossOrigin).toBe("anonymous");
      attempts.push(this.src);
      if (this.src.startsWith("https://")) throw new Error("CDN unavailable");
    }
  }
  vi.stubGlobal("Image", TestImage);
  const { loadAssets } = await import("./canvasPrimitives");
  const assets = await loadAssets(["office"]);
  expect(attempts).toEqual([
    "https://cdn.example/releases/sha/research/office-v8/base.webp",
    "/research/office-v8/base.png",
  ]);
  expect(assets.get("office")?.src).toBe("/research/office-v8/base.png");
});
