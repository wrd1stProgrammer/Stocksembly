import { describe, expect, it } from "vitest";
import {
  engagementSurface,
  productEngagementSchema,
} from "./productEngagement";

describe("engagement boundaries", () => {
  it("stores menu categories, never report IDs or search queries", () => {
    expect(engagementSurface("/ko/research-room/private-id")).toBe("reports");
    expect(engagementSurface("/ja")).toBe("landing");
    expect(engagementSurface("/briefing")).toBe("briefing");
  });
  it("rejects impossible visible duration and injected properties", () => {
    const input = {
      eventId: "00000000-0000-4000-8000-000000000001",
      sessionId: "00000000-0000-4000-8000-000000000002",
      surface: "landing",
      kind: "page",
      startedAt: "2026-09-19T00:00:00.000Z",
      endedAt: "2026-09-19T00:00:10.000Z",
      visibleMs: 5000,
    };
    expect(productEngagementSchema.safeParse(input).success).toBe(true);
    expect(
      productEngagementSchema.safeParse({ ...input, visibleMs: 60000 }).success,
    ).toBe(false);
    expect(
      productEngagementSchema.safeParse({ ...input, principalId: "admin" })
        .success,
    ).toBe(false);
  });
});
