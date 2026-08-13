import type { Locale } from "../../lib/i18n";

export function formatBriefingDateInZone(
  value: string,
  locale: Locale,
  timeZone: string,
  includeTime = false,
): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    month: "2-digit",
    day: "2-digit",
    ...(includeTime
      ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }
      : {}),
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  const month = Number(part("month"));
  const day = Number(part("day"));
  const time = includeTime ? ` ${part("hour")}:${part("minute")}` : "";
  if (locale === "ko") return `${month}월 ${day}일${time}`;
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ] as const;
  return `${months[month - 1] ?? ""} ${day}${time}`;
}

export function formatBriefingDate(
  value: string,
  locale: Locale,
  includeTime = false,
): string {
  return formatBriefingDateInZone(
    value,
    locale,
    "America/New_York",
    includeTime,
  );
}

export function formatBriefingPrice(
  value: number | undefined,
  currency?: string,
): string {
  if (value === undefined) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency ?? "USD",
    maximumFractionDigits: 2,
  }).format(value);
}
