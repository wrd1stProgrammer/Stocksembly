import {
  isUsMarketDay,
  US_MARKET_TIME_ZONE,
} from "../../briefing/domain/marketCalendar";
import type { ChartBar, TechnicalTimeframe } from "../domain/technicalChart";

const formatter = new Intl.DateTimeFormat("en-US", {
  timeZone: US_MARKET_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
export function marketDate(timestamp: string) {
  const parts = formatter.formatToParts(new Date(timestamp));
  const value = (key: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === key)?.value);
  return { year: value("year"), month: value("month"), day: value("day") };
}
type Day = ReturnType<typeof marketDate>;
function date(day: Day) {
  return new Date(Date.UTC(day.year, day.month - 1, day.day, 12));
}
function shift(day: Day, offset: number): Day {
  const next = date(day);
  next.setUTCDate(next.getUTCDate() + offset);
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  };
}
function key(day: Day) {
  return date(day).toISOString().slice(0, 10);
}
const exceptionalClosures = new Set(["2018-12-05", "2025-01-09"]);
export function chartMarketDay(day: Day): boolean {
  if (exceptionalClosures.has(key(day))) return false;
  const weekday = date(day).getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  // NYSE does not observe a Saturday New Year on the preceding Friday.
  if (day.month === 12 && day.day === 31 && weekday === 5) return true;
  if (
    day.year < 2022 &&
    day.month === 6 &&
    (day.day === 19 ||
      (day.day === 18 && weekday === 5) ||
      (day.day === 20 && weekday === 1))
  )
    return true;
  return isUsMarketDay(day);
}
function easternHour(day: Day, hour: number): number {
  const wanted = Date.UTC(day.year, day.month - 1, day.day, hour);
  let guess = wanted;
  for (let attempt = 0; attempt < 2; attempt++) {
    const parts = formatter.formatToParts(new Date(guess));
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)?.value);
    guess +=
      wanted -
      Date.UTC(
        value("year"),
        value("month") - 1,
        value("day"),
        value("hour"),
        value("minute"),
      );
  }
  return guess;
}
export function sessionClose(day: Day): number {
  const weekday = date(day).getUTCDay();
  const thanksgivingFriday =
    day.month === 11 && weekday === 5 && day.day >= 23 && day.day <= 29;
  const early =
    thanksgivingFriday ||
    (day.month === 12 && day.day === 24) ||
    (day.month === 7 && day.day === 3);
  return easternHour(day, early ? 13 : 16);
}
export function weekStart(day: Day): Day {
  return shift(day, -((date(day).getUTCDay() + 6) % 7));
}
export function barClosedAt(
  timestamp: string,
  timeframe: TechnicalTimeframe,
): number {
  const day = marketDate(timestamp);
  if (timeframe === "1w") {
    let last = shift(weekStart(day), 4);
    while (!chartMarketDay(last)) last = shift(last, -1);
    return sessionClose(last);
  }
  if (!chartMarketDay(day)) return Number.POSITIVE_INFINITY;
  if (timeframe === "1d") return sessionClose(day);
  return Math.min(
    Date.parse(timestamp) + (timeframe === "1h" ? 1 : 4) * 3_600_000,
    sessionClose(day),
  );
}
export function closedChartBars(
  bars: readonly Omit<ChartBar, "closedAt">[],
  timeframe: TechnicalTimeframe,
  asOf: string,
): readonly ChartBar[] {
  const cutoff = Date.parse(asOf);
  return bars.flatMap((bar) => {
    const closedAt = barClosedAt(bar.timestamp, timeframe);
    if (
      closedAt > cutoff ||
      Date.parse(bar.timestamp) >= closedAt ||
      !Number.isFinite(closedAt)
    )
      return [];
    return [
      {
        timestamp: bar.timestamp,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
        closedAt: new Date(closedAt).toISOString(),
      },
    ];
  });
}
export function weeklyFromDaily(
  bars: readonly ChartBar[],
  asOf: string,
): readonly ChartBar[] {
  const groups = new Map<string, ChartBar[]>();
  for (const bar of bars) {
    const start = key(weekStart(marketDate(bar.timestamp)));
    const group = groups.get(start) ?? [];
    group.push(bar);
    groups.set(start, group);
  }
  return [...groups.values()].flatMap((group) => {
    const first = group[0];
    const last = group.at(-1);
    if (!first || !last) return [];
    const monday = weekStart(marketDate(first.timestamp));
    const expected = Array.from({ length: 5 }, (_, index) =>
      shift(monday, index),
    )
      .filter(chartMarketDay)
      .map(key);
    if (
      expected.length !== group.length ||
      group.some(
        (bar, index) => key(marketDate(bar.timestamp)) !== expected[index],
      )
    )
      return [];
    const closedAt = barClosedAt(first.timestamp, "1w");
    if (closedAt > Date.parse(asOf)) return [];
    return [
      {
        timestamp: first.timestamp,
        closedAt: new Date(closedAt).toISOString(),
        open: first.open,
        high: Math.max(...group.map((bar) => bar.high)),
        low: Math.min(...group.map((bar) => bar.low)),
        close: last.close,
        volume: group.reduce((total, bar) => total + bar.volume, 0),
      },
    ];
  });
}
