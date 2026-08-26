import { describe, expect, it } from "vitest";
import { researchDispatchIsReady } from "./liveResearchApi";

describe("live research dispatch admission", () => {
  it("admits local research and requires the production queue", () => {
    expect(researchDispatchIsReady(true, false)).toBe(true);
    expect(researchDispatchIsReady(false, true)).toBe(true);
    expect(researchDispatchIsReady(false, false)).toBe(false);
  });
});
