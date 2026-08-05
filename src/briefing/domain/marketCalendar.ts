export const US_MARKET_TIME_ZONE = "America/New_York" as const;
const PREMARKET_BRIEFING_HOUR = 8;
const PREMARKET_BRIEFING_MINUTE = 30;

type CalendarDate = {
  readonly year: number;
  readonly month: number;
  readonly day: number;
};

function dateKey(value: CalendarDate): string {
  return `${value.year.toString().padStart(4, "0")}-${value.month
    .toString()
    .padStart(2, "0")}-${value.day.toString().padStart(2, "0")}`;
}

function utcDate(value: CalendarDate): Date {
  return new Date(Date.UTC(value.year, value.month - 1, value.day, 12));
}

function fromUtcDate(value: Date): CalendarDate {
  return {
    year: value.getUTCFullYear(),
    month: value.getUTCMonth() + 1,
    day: value.getUTCDate(),
  };
}

function plusDays(value: CalendarDate, days: number): CalendarDate {
  const date = utcDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return fromUtcDate(date);
}

function observed(value: CalendarDate): CalendarDate {
  const weekday = utcDate(value).getUTCDay();
  if (weekday === 6) return plusDays(value, -1);
  if (weekday === 0) return plusDays(value, 1);
  return value;
}

function nthWeekday(
  year: number,
  month: number,
  weekday: number,
  occurrence: number,
): CalendarDate {
  const first = new Date(Date.UTC(year, month - 1, 1, 12));
  const day =
    1 + ((weekday - first.getUTCDay() + 7) % 7) + 7 * (occurrence - 1);
  return { year, month, day };
}

function lastWeekday(
  year: number,
  month: number,
  weekday: number,
): CalendarDate {
  const last = new Date(Date.UTC(year, month, 0, 12));
  return {
    year,
    month,
    day: last.getUTCDate() - ((last.getUTCDay() - weekday + 7) % 7),
  };
}

function easterSunday(year: number): CalendarDate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { year, month, day };
}

function marketHolidayKeys(year: number): ReadonlySet<string> {
  const holidays = [
    observed({ year, month: 1, day: 1 }),
    nthWeekday(year, 1, 1, 3),
    nthWeekday(year, 2, 1, 3),
    plusDays(easterSunday(year), -2),
    lastWeekday(year, 5, 1),
    observed({ year, month: 6, day: 19 }),
    observed({ year, month: 7, day: 4 }),
    nthWeekday(year, 9, 1, 1),
    nthWeekday(year, 11, 4, 4),
    observed({ year, month: 12, day: 25 }),
  ];
  const nextYearObservedNewYear = observed({
    year: year + 1,
    month: 1,
    day: 1,
  });
  if (nextYearObservedNewYear.year === year)
    holidays.push(nextYearObservedNewYear);
  return new Set(holidays.map(dateKey));
}

export function isUsMarketDay(value: CalendarDate): boolean {
  const weekday = utcDate(value).getUTCDay();
  return (
    weekday !== 0 &&
    weekday !== 6 &&
    !marketHolidayKeys(value.year).has(dateKey(value))
  );
}

function easternParts(value: Date): CalendarDate & {
  readonly hour: number;
  readonly minute: number;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: US_MARKET_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((candidate) => candidate.type === type)?.value ?? 0);
  return {
    year: part("year"),
    month: part("month"),
    day: part("day"),
    hour: part("hour"),
    minute: part("minute"),
  };
}

function easternLocalToUtc(
  value: CalendarDate,
  hour: number,
  minute: number,
): Date {
  const desired = Date.UTC(
    value.year,
    value.month - 1,
    value.day,
    hour,
    minute,
  );
  let guess = desired;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = easternParts(new Date(guess));
    const represented = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
    );
    guess += desired - represented;
  }
  return new Date(guess);
}

export function nextUsPremarketBriefingAt(now = new Date()): string {
  const current = easternParts(now);
  let candidate: CalendarDate = current;
  const afterBriefingTime =
    current.hour > PREMARKET_BRIEFING_HOUR ||
    (current.hour === PREMARKET_BRIEFING_HOUR &&
      current.minute >= PREMARKET_BRIEFING_MINUTE);
  if (afterBriefingTime || !isUsMarketDay(candidate))
    candidate = plusDays(candidate, 1);
  while (!isUsMarketDay(candidate)) candidate = plusDays(candidate, 1);
  return easternLocalToUtc(
    candidate,
    PREMARKET_BRIEFING_HOUR,
    PREMARKET_BRIEFING_MINUTE,
  ).toISOString();
}

export function dueUsMarketDate(
  now = new Date(),
): { readonly marketDate: string; readonly scheduledFor: string } | undefined {
  const current = easternParts(now);
  if (!isUsMarketDay(current)) return undefined;
  const reachedBriefingTime =
    current.hour > PREMARKET_BRIEFING_HOUR ||
    (current.hour === PREMARKET_BRIEFING_HOUR &&
      current.minute >= PREMARKET_BRIEFING_MINUTE);
  if (!reachedBriefingTime || current.hour >= 16) return undefined;
  const marketDate = dateKey(current);
  return {
    marketDate,
    scheduledFor: easternLocalToUtc(
      current,
      PREMARKET_BRIEFING_HOUR,
      PREMARKET_BRIEFING_MINUTE,
    ).toISOString(),
  };
}
