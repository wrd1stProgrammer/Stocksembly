import { describe, expect, it } from "vitest";
import { selectNextEarnings } from "./briefingEarnings";

describe("selectNextEarnings", () => {
  it("keeps confirmed calendar events ahead of estimated provider dates", () => {
    expect(
      selectNextEarnings({
        earnings: {
          nextReportAt: "2026-10-29T20:00:00.000Z",
          nextReportCertainty: "estimated",
        },
        upcomingEvents: [
          {
            name: "Quarterly results",
            scheduledAt: "2026-10-28T20:00:00.000Z",
            whyItMatters: "Next report",
            certainty: "confirmed",
          },
        ],
      }),
    ).toMatchObject({
      scheduledAt: "2026-10-28T20:00:00.000Z",
      certainty: "confirmed",
    });
  });

  it("returns an estimated next report instead of dropping it", () => {
    expect(
      selectNextEarnings({
        earnings: {
          nextReportAt: "2026-10-29T20:00:00.000Z",
          nextReportCertainty: "estimated",
        },
        upcomingEvents: [],
      }),
    ).toMatchObject({
      scheduledAt: "2026-10-29T20:00:00.000Z",
      certainty: "estimated",
    });
  });

  it("returns undefined only when no next earnings date exists", () => {
    expect(selectNextEarnings({ upcomingEvents: [] })).toBeUndefined();
  });
});
