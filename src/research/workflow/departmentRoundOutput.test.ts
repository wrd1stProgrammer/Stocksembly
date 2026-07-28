import { describe, expect, it } from "vitest";
import { hasOnlyGroundedNumbers } from "./departmentRoundOutput";

describe("hasOnlyGroundedNumbers", () => {
  it("accepts a whole-number rendering of a source-backed decimal", () => {
    expect(
      hasOnlyGroundedNumbers(
        ["Resistance is near 341."],
        ["Resistance is between 334.99 and 340.65."],
      ),
    ).toBe(true);
  });

  it("rejects a number absent from the source material", () => {
    expect(
      hasOnlyGroundedNumbers(
        ["Revenue rose 37 percent."],
        ["Revenue increased without a quantified rate."],
      ),
    ).toBe(false);
  });
});
