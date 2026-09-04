import { describe, expect, it } from "vitest";
import { resolveMetaPixelId } from "./config";

describe("resolveMetaPixelId", () => {
  it("reads the pixel ID injected into the server runtime", () => {
    expect(
      resolveMetaPixelId({
        META_PIXEL_ID: " 1941324473216410 ",
      }),
    ).toBe("1941324473216410");
  });

  it("prefers a valid server runtime value", () => {
    expect(
      resolveMetaPixelId({
        META_PIXEL_ID: "111",
        NEXT_PUBLIC_META_PIXEL_ID: "222",
      }),
    ).toBe("111");
  });

  it("falls back when the server runtime value is invalid", () => {
    expect(
      resolveMetaPixelId({
        META_PIXEL_ID: "invalid",
        NEXT_PUBLIC_META_PIXEL_ID: " 222 ",
      }),
    ).toBe("222");
  });

  it("rejects invalid values", () => {
    expect(
      resolveMetaPixelId({
        META_PIXEL_ID: "invalid",
        NEXT_PUBLIC_META_PIXEL_ID: "also-invalid",
      }),
    ).toBeUndefined();
  });
});
