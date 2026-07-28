import { describe, expect, it } from "vitest";
import { officeRendererResolution } from "./officeGame";

describe("office renderer density", () => {
  it("uses device density while capping the production bitmap at two times", () => {
    expect(officeRendererResolution(1)).toBe(1);
    expect(officeRendererResolution(1.5)).toBe(1.5);
    expect(officeRendererResolution(3)).toBe(2);
  });
});
