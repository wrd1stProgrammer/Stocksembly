import { describe, expect, it } from "vitest";
import { formatResearchRoomPublishedAt } from "./ResearchRoomCatalog";

const NOW = Date.parse("2026-08-04T12:00:00.000Z");

describe("research room published time", () => {
  it("uses a localized relative time during the first 24 hours", () => {
    const publishedAt = "2026-08-04T08:48:00.000Z";

    expect(formatResearchRoomPublishedAt(publishedAt, "ko", NOW)).toBe(
      "3시간 12분 전",
    );
    expect(formatResearchRoomPublishedAt(publishedAt, "en", NOW)).toBe(
      "3h 12m ago",
    );
  });

  it("keeps the calendar date after 24 hours", () => {
    expect(
      formatResearchRoomPublishedAt("2026-08-02T12:00:00.000Z", "en", NOW),
    ).toBe("Aug 2, 2026");
  });
});
