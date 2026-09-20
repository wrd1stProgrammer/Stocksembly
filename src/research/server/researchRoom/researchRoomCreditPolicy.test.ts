import { describe, expect, it } from "vitest";
import { requiresResearchRoomViewCredit } from "./researchRoomIndexability";

describe("research room credit policy", () => {
  const now = new Date("2026-09-02T00:00:00.000Z");

  it("charges for a report that is still inside the first 30 days", () => {
    expect(
      requiresResearchRoomViewCredit("2026-08-03T00:00:00.001Z", now),
    ).toBe(true);
  });

  it("still charges after the former seven-day boundary", () => {
    expect(
      requiresResearchRoomViewCredit("2026-08-26T00:00:00.000Z", now),
    ).toBe(true);
  });

  it("does not charge once the 30-day boundary is reached", () => {
    expect(
      requiresResearchRoomViewCredit("2026-08-03T00:00:00.000Z", now),
    ).toBe(false);
  });
});
