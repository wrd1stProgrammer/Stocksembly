import { z } from "zod";

export const adminRangePresetSchema = z.enum(["7", "30", "90", "custom"]);
export type AdminRangePreset = z.infer<typeof adminRangePresetSchema>;

export const acquisitionChannelSchema = z.enum([
  "all",
  "direct",
  "paid_search",
  "organic_search",
  "social",
  "email",
  "referral",
  "campaign",
  "other",
  "unknown",
]);
export type AcquisitionChannel = z.infer<typeof acquisitionChannelSchema>;

const optionalAttributionValue = z.string().trim().max(120).optional();
export const acquisitionAttributionInputSchema = z
  .object({
    source: optionalAttributionValue,
    medium: optionalAttributionValue,
    campaign: optionalAttributionValue,
    term: optionalAttributionValue,
    content: optionalAttributionValue,
    referrerHost: z.string().trim().max(253).optional(),
    landingPath: z.string().trim().max(500).startsWith("/"),
    capturedAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export type AcquisitionAttributionInput = z.infer<
  typeof acquisitionAttributionInputSchema
>;

export const analyticsEventNameSchema = z.enum([
  "account_first_authenticated",
  "research_started",
  "research_completed",
  "report_opened",
  "consultation_submitted",
  "consultation_answered",
  "briefing_opened",
  "briefing_read",
  "watchlist_added",
  "watchlist_removed",
  "checkout_started",
  "payment_succeeded",
  "payment_failed",
  "membership_deactivated",
  "cancel_at_period_end_changed",
]);
export type AnalyticsEventName = z.infer<typeof analyticsEventNameSchema>;

export const meaningfulAnalyticsEvents = Object.freeze([
  "research_started",
  "research_completed",
  "report_opened",
  "consultation_submitted",
  "consultation_answered",
  "briefing_opened",
  "briefing_read",
  "watchlist_added",
  "watchlist_removed",
] as const satisfies readonly AnalyticsEventName[]);

export type DataStatus = {
  readonly availability: "available" | "unavailable";
  readonly accuracy: "exact" | "estimated";
  readonly completeness: "complete" | "partial";
  readonly caveat?: string;
};

export type AdminAnalyticsQuery = {
  readonly range: AdminRangePreset;
  readonly from: string;
  readonly to: string;
  readonly fromDate: string;
  readonly throughDate: string;
  readonly channel: AcquisitionChannel;
  readonly locale?: string;
  readonly plan?: "free" | "pro" | "ultra";
  readonly status?: "active" | "trialing" | "past_due" | "cancelled";
  readonly search?: string;
  readonly page: number;
  readonly pageSize: number;
};

export type AdminKpis = {
  readonly newUsers: number;
  readonly dau: number;
  readonly wau: number;
  readonly mau: number;
  readonly signupToPaidRate: number | null;
  readonly activePaid: number;
};

export type AdminTrendPoint = {
  readonly date: string;
  readonly signups: number;
  readonly activeUsers: number;
  readonly actions: number;
  readonly payments: number;
};

export type AdminFunnel = {
  readonly denominator: number;
  readonly activated?: number;
  readonly paid: number;
  readonly activationRate?: number | null;
  readonly paidRate: number | null;
  readonly status: DataStatus;
};

export type AdminBreakdown = {
  readonly key: string;
  readonly label: string;
  readonly count: number;
  readonly rate: number | null;
};

export type AdminRetention = {
  readonly horizon: "D1" | "D7" | "D30";
  readonly eligible: number;
  readonly retained: number;
  readonly rate: number | null;
};

export type AdminUsage = {
  readonly event: AnalyticsEventName;
  readonly label: string;
  readonly events: number;
  readonly users: number;
};

export type AdminUserRow = {
  readonly principalId: string;
  readonly email: string | null;
  readonly displayName: string | null;
  readonly locale: string | null;
  readonly acquisitionChannel: Exclude<AcquisitionChannel, "all">;
  readonly createdAt: string;
  readonly lastSeenAt: string;
  readonly plan: "free" | "pro" | "ultra" | "unknown";
  readonly status: "active" | "trialing" | "past_due" | "cancelled" | "none";
  readonly actionCount: number;
  readonly lastMeaningfulAt: string | null;
  readonly firstPaidAt: string | null;
};

export type AdminUserList = {
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly pageCount: number;
  readonly items: readonly AdminUserRow[];
};

export type AdminAnalyticsOverview = {
  readonly generatedAt: string;
  readonly query: AdminAnalyticsQuery;
  readonly status: DataStatus;
  readonly kpis: AdminKpis;
  readonly trends: readonly AdminTrendPoint[];
  readonly signupFunnel: AdminFunnel;
  readonly checkoutFunnel: AdminFunnel;
  readonly acquisition: readonly AdminBreakdown[];
  readonly plans: readonly AdminBreakdown[];
  readonly statuses: readonly AdminBreakdown[];
  readonly retention: readonly AdminRetention[];
  readonly usage: readonly AdminUsage[];
  readonly payments: {
    readonly succeeded: number;
    readonly failed: number;
    readonly failureRate: number | null;
    readonly deactivated: number;
    readonly cancelScheduled: number;
    readonly pastDue: number;
  };
  readonly users: AdminUserList;
};

export type AdminUserTimelineEvent = {
  readonly id: string;
  readonly event: AnalyticsEventName;
  readonly label: string;
  readonly occurredAt: string;
};

export type AdminUserDetail = {
  readonly generatedAt: string;
  readonly user: AdminUserRow;
  readonly timeline: readonly AdminUserTimelineEvent[];
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const KST_OFFSET_MS = 9 * 60 * 60 * 1_000;

function kstDate(value: Date): string {
  return new Date(value.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

function kstMidnightUtc(date: string): Date {
  return new Date(`${date}T00:00:00+09:00`);
}

function plusDays(date: string, days: number): string {
  const value = kstMidnightUtc(date);
  value.setUTCDate(value.getUTCDate() + days);
  return kstDate(value);
}

function validDate(value: string | null): value is string {
  if (value === null || !DATE_PATTERN.test(value)) return false;
  return kstDate(kstMidnightUtc(value)) === value;
}

export function parseAdminAnalyticsQuery(
  searchParams: URLSearchParams,
  asOf = new Date(),
): AdminAnalyticsQuery {
  const parsedRange = adminRangePresetSchema.safeParse(
    searchParams.get("range") ?? "30",
  );
  const range = parsedRange.success ? parsedRange.data : "30";
  const today = kstDate(asOf);
  let fromDate: string;
  let throughDate: string;
  if (range === "custom") {
    const requestedFrom = searchParams.get("fromDate");
    const requestedThrough = searchParams.get("throughDate");
    if (!validDate(requestedFrom) || !validDate(requestedThrough)) {
      throw new Error("ADMIN_ANALYTICS_DATE_INVALID");
    }
    fromDate = requestedFrom;
    throughDate = requestedThrough;
  } else {
    const days = Number(range);
    fromDate = plusDays(today, -(days - 1));
    throughDate = today;
  }
  if (fromDate > throughDate || throughDate > today)
    throw new Error("ADMIN_ANALYTICS_DATE_INVALID");
  const inclusiveDays =
    Math.round(
      (kstMidnightUtc(throughDate).getTime() -
        kstMidnightUtc(fromDate).getTime()) /
        86_400_000,
    ) + 1;
  if (inclusiveDays > 366) throw new Error("ADMIN_ANALYTICS_RANGE_TOO_LARGE");
  const earliest = plusDays(today, -365);
  if (fromDate < earliest) throw new Error("ADMIN_ANALYTICS_RANGE_TOO_OLD");
  const parsedChannel = acquisitionChannelSchema.safeParse(
    searchParams.get("channel") ?? "all",
  );
  const locale = searchParams.get("locale")?.trim() || undefined;
  const planValue = searchParams.get("plan");
  const statusValue = searchParams.get("status");
  const page = Math.max(
    1,
    Number.parseInt(searchParams.get("page") ?? "1", 10) || 1,
  );
  const pageSize = Math.min(
    100,
    Math.max(
      10,
      Number.parseInt(searchParams.get("pageSize") ?? "50", 10) || 50,
    ),
  );
  const rawSearch = searchParams.get("q")?.normalize("NFC").trim();
  const search = rawSearch?.slice(0, 100) || undefined;
  return {
    range,
    from: kstMidnightUtc(fromDate).toISOString(),
    to:
      throughDate === today
        ? asOf.toISOString()
        : kstMidnightUtc(plusDays(throughDate, 1)).toISOString(),
    fromDate,
    throughDate,
    channel: parsedChannel.success ? parsedChannel.data : "all",
    ...(locale === undefined ? {} : { locale }),
    ...(planValue === "free" || planValue === "pro" || planValue === "ultra"
      ? { plan: planValue }
      : {}),
    ...(statusValue === "active" ||
    statusValue === "trialing" ||
    statusValue === "past_due" ||
    statusValue === "cancelled"
      ? { status: statusValue }
      : {}),
    ...(search === undefined ? {} : { search }),
    page,
    pageSize,
  };
}

export function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0
    ? null
    : Math.round((numerator / denominator) * 10_000) / 100;
}
