import { describe, expect, it } from "vitest";
import { requiresResearchRoomViewCredit } from "./researchRoomIndexability";

describe("research room credit policy", () => {
  const now = new Date("2026-08-10T00:00:00.000Z");

  it("charges for a report that is still inside the first seven days", () => {
    expect(
      requiresResearchRoomViewCredit("2026-08-03T00:00:00.001Z", now),
    ).toBe(true);
  });

  it("does not charge once the seven-day boundary is reached", () => {
    expect(
      requiresResearchRoomViewCredit("2026-08-03T00:00:00.000Z", now),
    ).toBe(false);
  });
});
