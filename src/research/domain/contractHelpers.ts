import { createHash } from "node:crypto";

const RFC3339_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function daysInMonth(year: number, month: number): number {
  const lastDay = new Date(0);
  lastDay.setUTCHours(0, 0, 0, 0);
  lastDay.setUTCFullYear(year, month, 0);
  return lastDay.getUTCDate();
}

function isCalendarDate(year: number, month: number, day: number): boolean {
  return (
    month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month)
  );
}

export function isStrictIsoDate(value: string): boolean {
  const match = ISO_DATE_PATTERN.exec(value);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return isCalendarDate(year, month, day);
}

export function isStrictRfc3339(value: string): boolean {
  const match = RFC3339_PATTERN.exec(value);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (!isCalendarDate(year, month, day)) return false;
  if (hour > 23 || minute > 59 || second > 59) return false;
  const offset = match[8];
  if (offset !== undefined && offset !== "Z") {
    const offsetHour = Number(offset.slice(1, 3));
    const offsetMinute = Number(offset.slice(4, 6));
    if (offsetHour > 23 || offsetMinute > 59) return false;
  }
  return Number.isFinite(Date.parse(value));
}

export class ContractViolation extends Error {
  readonly name = "ContractViolation";

  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function timestampMillis(value: string): number {
  if (!isStrictRfc3339(value)) {
    throw new ContractViolation(
      "invalid_timestamp",
      `invalid ISO timestamp: ${value}`,
    );
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new ContractViolation(
      "invalid_timestamp",
      `invalid ISO timestamp: ${value}`,
    );
  }
  return parsed;
}

export function assertTimestampOrder(
  earlier: string,
  later: string,
  label: string,
): void {
  if (timestampMillis(earlier) > timestampMillis(later)) {
    throw new ContractViolation("timestamp_order", `${label} is out of order`);
  }
}

type CanonicalObject = { readonly [key: string]: CanonicalValue };
type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalValue[]
  | CanonicalObject;

function isPlainRecord(value: object): value is Record<string, unknown> {
  return Object.getPrototypeOf(value) === Object.prototype;
}

function canonicalValue(value: unknown): CanonicalValue {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new ContractViolation(
        "non_finite_number",
        "canonical values cannot contain non-finite numbers",
      );
    }
    return value;
  }
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Uint8Array) return Array.from(value);
  if (Array.isArray(value)) return value.map((entry) => canonicalValue(entry));
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && isPlainRecord(value)) {
    const entries = Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalValue(entry)] as const);
    return Object.fromEntries(entries);
  }
  throw new ContractViolation(
    "uncanonical_value",
    "value cannot be canonically serialized",
  );
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

export function hashCanonical(value: unknown): string {
  return createHash("sha256")
    .update(canonicalJson(value), "utf8")
    .digest("hex");
}

export function hashBytes(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function isSha256(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}
