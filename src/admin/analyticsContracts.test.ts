import { describe, expect, it } from "vitest";
import { parseAdminAnalyticsQuery, ratio } from "./analyticsContracts";

describe("admin analytics query", () => {
  const asOf = new Date("2026-08-14T03:30:00+09:00");

  it("builds the seven-day KST range including the current partial day", () => {
    const query = parseAdminAnalyticsQuery(
      new URLSearchParams({ range: "7" }),
      asOf,
    );
    expect(query).toMatchObject({
      range: "7",
      fromDate: "2026-08-08",
      throughDate: "2026-08-14",
      from: "2026-08-07T15:00:00.000Z",
      to: "2026-08-13T18:30:00.000Z",
    });
  });

  it("turns inclusive closed custom dates into a half-open range", () => {
    const query = parseAdminAnalyticsQuery(
      new URLSearchParams({
        range: "custom",
        fromDate: "2026-08-01",
        throughDate: "2026-08-03",
      }),
      asOf,
    );
    expect(query.from).toBe("2026-07-31T15:00:00.000Z");
    expect(query.to).toBe("2026-08-03T15:00:00.000Z");
  });

  it("rejects reversed and future ranges", () => {
    expect(() =>
      parseAdminAnalyticsQuery(
        new URLSearchParams({
          range: "custom",
          fromDate: "2026-08-10",
          throughDate: "2026-08-01",
        }),
        asOf,
      ),
    ).toThrow("ADMIN_ANALYTICS_DATE_INVALID");
    expect(() =>
      parseAdminAnalyticsQuery(
        new URLSearchParams({
          range: "custom",
          fromDate: "2026-08-15",
          throughDate: "2026-08-15",
        }),
        asOf,
      ),
    ).toThrow("ADMIN_ANALYTICS_DATE_INVALID");
  });

  it("renders a zero denominator as unavailable rather than zero percent", () => {
    expect(ratio(0, 0)).toBeNull();
    expect(ratio(1, 4)).toBe(25);
  });
});
