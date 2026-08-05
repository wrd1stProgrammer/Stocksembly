import { describe, expect, it } from "vitest";
import {
  dueUsMarketDate,
  isUsMarketDay,
  nextUsPremarketBriefingAt,
} from "./marketCalendar";

describe("US pre-market briefing calendar", () => {
  it("schedules 08:30 New York time across daylight saving time", () => {
    expect(
      nextUsPremarketBriefingAt(new Date("2026-08-05T11:00:00.000Z")),
    ).toBe("2026-08-05T12:30:00.000Z");
    expect(
      nextUsPremarketBriefingAt(new Date("2026-01-07T12:00:00.000Z")),
    ).toBe("2026-01-07T13:30:00.000Z");
  });

  it("skips weekends and exchange holidays", () => {
    expect(isUsMarketDay({ year: 2026, month: 12, day: 25 })).toBe(false);
    expect(isUsMarketDay({ year: 2026, month: 12, day: 26 })).toBe(false);
    expect(
      nextUsPremarketBriefingAt(new Date("2026-12-25T14:00:00.000Z")),
    ).toBe("2026-12-28T13:30:00.000Z");
  });

  it("opens a catch-up window after the scheduled run on market days", () => {
    expect(dueUsMarketDate(new Date("2026-08-05T12:31:00.000Z"))).toEqual({
      marketDate: "2026-08-05",
      scheduledFor: "2026-08-05T12:30:00.000Z",
    });
    expect(
      dueUsMarketDate(new Date("2026-08-05T21:00:00.000Z")),
    ).toBeUndefined();
  });
});
