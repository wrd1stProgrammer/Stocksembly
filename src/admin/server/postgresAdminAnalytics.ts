import type { Pool, PoolClient } from "pg";
import {
  isOnboardingDiscoverySource,
  ONBOARDING_DISCOVERY_SOURCE_LABELS_KO,
} from "../../accounts/onboarding";
import {
  type AdminAnalyticsOverview,
  type AdminAnalyticsQuery,
  type AdminBreakdown,
  type AdminRetention,
  type AdminUsage,
  type AdminUserDetail,
  type AdminUserList,
  type AdminUserRow,
  ratio,
} from "../analyticsContracts";
import { analyticsEventLabels } from "../metricDefinitions";

const CANONICAL_EVENTS_CTE = `
  canonical_event_source AS (
    SELECT event_key, principal_id, event_name, occurred_at
    FROM analytics_events
    UNION ALL
    SELECT event_key, principal_id,
      CASE kind
        WHEN 'research_run_created' THEN 'research_started'
        WHEN 'full_research' THEN 'research_completed'
        WHEN 'department_research' THEN 'research_completed'
        WHEN 'research_room' THEN 'report_opened'
        WHEN 'consultation_answered' THEN 'consultation_answered'
        WHEN 'chat_bundle' THEN 'consultation_submitted'
        ELSE 'report_opened'
      END AS event_name,
      occurred_at
    FROM usage_events
    UNION ALL
    SELECT 'research-started:' || run_id::text, principal_id,
      'research_started', created_at
    FROM research_run_ownership
    UNION ALL
    SELECT 'report-opened:' || report_id::text, principal_id,
      'report_opened', recorded_at
    FROM report_ownership
    UNION ALL
    SELECT 'consultation:' || question_id::text, principal_id,
      'consultation_answered', created_at
    FROM report_consultations
    UNION ALL
    SELECT 'briefing-read:' || briefing_id::text, principal_id,
      'briefing_read', read_at
    FROM briefing_deliveries
    WHERE read_at IS NOT NULL
    UNION ALL
    SELECT 'watchlist-added:' || principal_id || ':' || symbol, principal_id,
      'watchlist_added', created_at
    FROM briefing_watchlist_items
    WHERE active = true
  ),
  canonical_events AS (
    SELECT DISTINCT ON (event_key)
      event_key, principal_id, event_name, occurred_at
    FROM canonical_event_source
    ORDER BY event_key, occurred_at DESC
  )`;

const MEANINGFUL_SQL = `(
  'research_started', 'research_completed', 'report_opened',
  'consultation_submitted', 'consultation_answered', 'briefing_opened',
  'briefing_read', 'watchlist_added', 'watchlist_removed'
)`;

type UserFilters = {
  readonly values: readonly unknown[];
  readonly sql: string;
};

function userFilters(
  query: AdminAnalyticsQuery,
  startIndex: number,
): UserFilters {
  const conditions: string[] = [];
  const values: unknown[] = [];
  const add = (condition: (placeholder: string) => string, value: unknown) => {
    values.push(value);
    conditions.push(condition(`$${startIndex + values.length - 1}`));
  };
  if (query.channel !== "all")
    add((value) => `u.acquisition_channel = ${value}`, query.channel);
  if (query.locale !== undefined)
    add((value) => `u.preferred_locale = ${value}`, query.locale);
  if (query.source !== undefined)
    add(
      (value) =>
        `EXISTS (SELECT 1 FROM user_acquisition_attribution ufa WHERE ufa.principal_id = u.principal_id AND lower(ufa.source) = lower(${value}))`,
      query.source,
    );
  if (query.campaign !== undefined)
    add(
      (value) =>
        `EXISTS (SELECT 1 FROM user_acquisition_attribution ufa WHERE ufa.principal_id = u.principal_id AND lower(ufa.campaign) = lower(${value}))`,
      query.campaign,
    );
  return {
    values,
    sql: conditions.length === 0 ? "TRUE" : conditions.join(" AND "),
  };
}

function scopedUserFilters(
  query: AdminAnalyticsQuery,
  startIndex: number,
): UserFilters {
  const global = userFilters(query, startIndex);
  const conditions = global.sql === "TRUE" ? [] : [global.sql];
  const values = [...global.values];
  const add = (condition: (placeholder: string) => string, value: unknown) => {
    values.push(value);
    conditions.push(condition(`$${startIndex + values.length - 1}`));
  };
  if (query.plan !== undefined) {
    add(
      (value) =>
        `(CASE WHEN e.plan_code IN ('pro','ultra') THEN e.plan_code ELSE 'free' END) = ${value}`,
      query.plan,
    );
  }
  if (query.status !== undefined)
    add((value) => `COALESCE(e.status, 'none') = ${value}`, query.status);
  if (query.search !== undefined) {
    const escaped = query.search
      .toLocaleLowerCase("und")
      .replaceAll("\\", "\\\\")
      .replaceAll("%", "\\%")
      .replaceAll("_", "\\_");
    add(
      (value) =>
        `(lower(trim(COALESCE(u.email, ''))) LIKE ${value} || '%' ESCAPE '\\' OR lower(trim(COALESCE(u.display_name, ''))) LIKE ${value} || '%' ESCAPE '\\')`,
      escaped,
    );
  }
  return {
    values,
    sql: conditions.length === 0 ? "TRUE" : conditions.join(" AND "),
  };
}

function number(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function iso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const parsed = new Date(String(value));
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function requiredIso(value: unknown): string {
  return iso(value) ?? new Date(0).toISOString();
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function breakdown(
  rows: readonly { readonly key: string; readonly count: unknown }[],
  labels: Readonly<Record<string, string>>,
): readonly AdminBreakdown[] {
  const total = rows.reduce((sum, row) => sum + number(row.count), 0);
  return rows.map((row) => ({
    key: row.key,
    label: labels[row.key] ?? row.key,
    count: number(row.count),
    rate: ratio(number(row.count), total),
  }));
}

const CHANNEL_LABELS: Readonly<Record<string, string>> = {
  direct: "직접 유입",
  paid_search: "유료 검색",
  organic_search: "자연 검색",
  social: "소셜",
  email: "이메일",
  referral: "추천·링크",
  campaign: "캠페인",
  other: "기타",
  unknown: "미확인",
};

const PLAN_LABELS: Readonly<Record<string, string>> = {
  free: "Free",
  pro: "Pro",
  ultra: "Ultra",
  unknown: "알 수 없음",
};

const STATUS_LABELS: Readonly<Record<string, string>> = {
  active: "활성",
  trialing: "체험 중",
  past_due: "결제 지연",
  cancelled: "해지",
  none: "결제 없음",
};

function mapUser(row: Record<string, unknown>): AdminUserRow {
  const plan = String(row["plan"] ?? "unknown");
  const status = String(row["status"] ?? "none");
  const channel = String(row["acquisition_channel"] ?? "unknown");
  return {
    principalId: String(row["principal_id"]),
    email: row["email"] === null ? null : String(row["email"]),
    displayName:
      row["display_name"] === null ? null : String(row["display_name"]),
    locale:
      row["preferred_locale"] === null ? null : String(row["preferred_locale"]),
    acquisitionChannel: ([
      "direct",
      "paid_search",
      "organic_search",
      "social",
      "email",
      "referral",
      "campaign",
      "other",
      "unknown",
    ].includes(channel)
      ? channel
      : "unknown") as AdminUserRow["acquisitionChannel"],
    onboardingDiscoverySource: isOnboardingDiscoverySource(
      row["onboarding_discovery_source"],
    )
      ? row["onboarding_discovery_source"]
      : null,
    acquisition:
      row["acquisition_captured_at"] === null ||
      row["acquisition_captured_at"] === undefined
        ? null
        : {
            source: nullableString(row["acquisition_source"]),
            medium: nullableString(row["acquisition_medium"]),
            campaign: nullableString(row["acquisition_campaign"]),
            term: nullableString(row["acquisition_term"]),
            content: nullableString(row["acquisition_content"]),
            referrerHost: nullableString(row["acquisition_referrer_host"]),
            landingPath: nullableString(row["acquisition_landing_path"]),
            capturedAt: iso(row["acquisition_captured_at"]),
          },
    createdAt: requiredIso(row["created_at"]),
    lastSeenAt: requiredIso(row["last_seen_at"]),
    plan: (["free", "pro", "ultra", "unknown"].includes(plan)
      ? plan
      : "unknown") as AdminUserRow["plan"],
    status: (["active", "trialing", "past_due", "cancelled", "none"].includes(
      status,
    )
      ? status
      : "none") as AdminUserRow["status"],
    actionCount: number(row["action_count"]),
    lastMeaningfulAt: iso(row["last_meaningful_at"]),
    firstPaidAt: iso(row["first_paid_at"]),
  };
}

async function listUsersWithClient(
  client: PoolClient,
  query: AdminAnalyticsQuery,
): Promise<AdminUserList> {
  const filters = scopedUserFilters(query, 3);
  const values = [query.from, query.to, ...filters.values];
  const where = `u.created_at >= $1 AND u.created_at < $2 AND ${filters.sql}`;
  const totalResult = await client.query<{ total: number }>(
    `SELECT COUNT(*)::int AS total
     FROM app_users u
     LEFT JOIN entitlements e ON e.principal_id = u.principal_id
     WHERE ${where}`,
    values,
  );
  const offset = (query.page - 1) * query.pageSize;
  const rows = await client.query<Record<string, unknown>>(
    `WITH ${CANONICAL_EVENTS_CTE}
     SELECT u.principal_id, u.email, u.display_name, u.preferred_locale,
       u.acquisition_channel, u.onboarding_discovery_source,
       u.created_at, u.last_seen_at,
       a.source AS acquisition_source, a.medium AS acquisition_medium,
       a.campaign AS acquisition_campaign, a.term AS acquisition_term,
       a.content AS acquisition_content,
       a.referrer_host AS acquisition_referrer_host,
       a.landing_path AS acquisition_landing_path,
       a.captured_at AS acquisition_captured_at,
       CASE WHEN e.plan_code IN ('pro','ultra') THEN e.plan_code
            WHEN e.plan_code IS NULL OR e.plan_code = 'preview' THEN 'free'
            ELSE 'unknown' END AS plan,
       COALESCE(e.status, 'none') AS status,
       COUNT(ce.event_key) FILTER (
         WHERE ce.event_name IN ${MEANINGFUL_SQL}
           AND ce.occurred_at >= $1 AND ce.occurred_at < $2
       )::int AS action_count,
       MAX(ce.occurred_at) FILTER (
         WHERE ce.event_name IN ${MEANINGFUL_SQL}
           AND ce.occurred_at >= $1 AND ce.occurred_at < $2
       ) AS last_meaningful_at,
       MIN(ce.occurred_at) FILTER (
         WHERE ce.event_name = 'payment_succeeded'
       ) AS first_paid_at
     FROM app_users u
     LEFT JOIN entitlements e ON e.principal_id = u.principal_id
     LEFT JOIN user_acquisition_attribution a
       ON a.principal_id = u.principal_id
     LEFT JOIN canonical_events ce ON ce.principal_id = u.principal_id
     WHERE ${where}
     GROUP BY u.principal_id, e.plan_code, e.status, a.principal_id
     ORDER BY u.created_at DESC, u.principal_id DESC
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, query.pageSize, offset],
  );
  const total = number(totalResult.rows[0]?.total);
  return {
    total,
    page: query.page,
    pageSize: query.pageSize,
    pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
    items: rows.rows.map(mapUser),
  };
}

async function withReadTransaction<T>(
  pool: Pool,
  run: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query(
      "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
    );
    const result = await run(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function queryAdminUsers(
  pool: Pool,
  query: AdminAnalyticsQuery,
): Promise<AdminUserList> {
  return await withReadTransaction(
    pool,
    async (client) => await listUsersWithClient(client, query),
  );
}

export async function queryAdminOverview(
  pool: Pool,
  query: AdminAnalyticsQuery,
): Promise<AdminAnalyticsOverview> {
  return await withReadTransaction(pool, async (client) => {
    const generated = await client.query<{ now: string }>(
      "SELECT transaction_timestamp() AS now",
    );
    const generatedAt = iso(generated.rows[0]?.now) ?? new Date().toISOString();
    const global = userFilters(query, 3);
    const globalValues = [query.from, query.to, ...global.values];
    const summary = await client.query<Record<string, unknown>>(
      `WITH ${CANONICAL_EVENTS_CTE}, filtered_users AS (
         SELECT u.* FROM app_users u WHERE ${global.sql}
       )
       SELECT
         COUNT(DISTINCT u.principal_id) FILTER (
           WHERE u.created_at >= $1 AND u.created_at < $2
         )::int AS new_users,
         COUNT(DISTINCT ce.principal_id) FILTER (
           WHERE ce.event_name IN ${MEANINGFUL_SQL}
             AND ce.occurred_at >= date_trunc('day', $2::timestamptz AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul'
             AND ce.occurred_at < $2
         )::int AS dau,
         COUNT(DISTINCT ce.principal_id) FILTER (
           WHERE ce.event_name IN ${MEANINGFUL_SQL}
             AND ce.occurred_at >= (date_trunc('day', $2::timestamptz AT TIME ZONE 'Asia/Seoul') - interval '6 days') AT TIME ZONE 'Asia/Seoul'
             AND ce.occurred_at < $2
         )::int AS wau,
         COUNT(DISTINCT ce.principal_id) FILTER (
           WHERE ce.event_name IN ${MEANINGFUL_SQL}
             AND ce.occurred_at >= (date_trunc('day', $2::timestamptz AT TIME ZONE 'Asia/Seoul') - interval '29 days') AT TIME ZONE 'Asia/Seoul'
             AND ce.occurred_at < $2
         )::int AS mau,
         COUNT(DISTINCT u.principal_id) FILTER (
           WHERE e.plan_code IN ('pro','ultra')
             AND e.status IN ('active','trialing')
         )::int AS active_paid,
         COUNT(DISTINCT u.principal_id) FILTER (
           WHERE u.created_at >= $1 AND u.created_at < $2
             AND e.plan_code IN ('pro','ultra')
             AND e.current_period_start >= u.created_at
             AND e.current_period_start < u.created_at + interval '30 days'
         )::int AS signup_paid
       FROM filtered_users u
       LEFT JOIN entitlements e ON e.principal_id = u.principal_id
       LEFT JOIN canonical_events ce ON ce.principal_id = u.principal_id`,
      globalValues,
    );
    const summaryRow = summary.rows[0] ?? {};
    const newUsers = number(summaryRow["new_users"]);
    const signupPaid = number(summaryRow["signup_paid"]);

    const trends = await client.query<Record<string, unknown>>(
      `WITH ${CANONICAL_EVENTS_CTE}, days AS (
         SELECT generate_series(
           date_trunc('day', $1::timestamptz AT TIME ZONE 'Asia/Seoul'),
           date_trunc('day', ($2::timestamptz - interval '1 microsecond') AT TIME ZONE 'Asia/Seoul'),
           interval '1 day'
         )::date AS day
       ), filtered_users AS (SELECT u.* FROM app_users u WHERE ${global.sql})
       SELECT d.day::text AS date,
         COUNT(DISTINCT u.principal_id)::int AS signups,
         COUNT(DISTINCT ce.principal_id) FILTER (
           WHERE ce.event_name IN ${MEANINGFUL_SQL}
         )::int AS active_users,
         COUNT(DISTINCT ce.event_key) FILTER (
           WHERE ce.event_name IN ${MEANINGFUL_SQL}
         )::int AS actions,
         COUNT(DISTINCT ce.event_key) FILTER (
           WHERE ce.event_name = 'payment_succeeded'
         )::int AS payments
       FROM days d
       LEFT JOIN filtered_users u
         ON (u.created_at AT TIME ZONE 'Asia/Seoul')::date = d.day
       LEFT JOIN canonical_events ce
         ON ce.principal_id IN (SELECT principal_id FROM filtered_users)
        AND (ce.occurred_at AT TIME ZONE 'Asia/Seoul')::date = d.day
       GROUP BY d.day ORDER BY d.day`,
      globalValues,
    );

    const signupFunnelResult = await client.query<Record<string, unknown>>(
      `WITH ${CANONICAL_EVENTS_CTE}, cohort AS (
         SELECT u.principal_id, u.created_at
         FROM app_users u
         WHERE u.created_at >= $1 AND u.created_at < $2 AND ${global.sql}
       )
       SELECT COUNT(*)::int AS denominator,
         COUNT(*) FILTER (WHERE EXISTS (
           SELECT 1 FROM canonical_events ce
           WHERE ce.principal_id = c.principal_id
             AND ce.event_name = 'research_completed'
             AND ce.occurred_at >= c.created_at
             AND ce.occurred_at < c.created_at + interval '7 days'
         ))::int AS activated,
         COUNT(*) FILTER (WHERE EXISTS (
           SELECT 1 FROM canonical_events ce
           WHERE ce.principal_id = c.principal_id
             AND ce.event_name = 'payment_succeeded'
             AND ce.occurred_at >= c.created_at
             AND ce.occurred_at < c.created_at + interval '30 days'
         ) OR EXISTS (
           SELECT 1 FROM entitlements e
           WHERE e.principal_id = c.principal_id
             AND e.plan_code IN ('pro','ultra')
             AND e.current_period_start >= c.created_at
             AND e.current_period_start < c.created_at + interval '30 days'
         ))::int AS paid
       FROM cohort c`,
      globalValues,
    );
    const signupRow = signupFunnelResult.rows[0] ?? {};
    const signupDenominator = number(signupRow["denominator"]);
    const activated = number(signupRow["activated"]);
    const paid = number(signupRow["paid"]);

    const checkout = await client.query<Record<string, unknown>>(
      `SELECT COUNT(DISTINCT a.attempt_id)::int AS denominator,
         COUNT(DISTINCT a.attempt_id) FILTER (
           WHERE a.paid_at >= a.ready_at
             AND a.paid_at < a.ready_at + interval '7 days'
         )::int AS paid
       FROM billing_checkout_attempts a
       JOIN app_users u ON u.principal_id = a.principal_id
       WHERE a.ready_at >= $1 AND a.ready_at < $2 AND ${global.sql}`,
      globalValues,
    );
    const checkoutRow = checkout.rows[0] ?? {};
    const checkoutDenominator = number(checkoutRow["denominator"]);
    const checkoutPaid = number(checkoutRow["paid"]);

    const acquisitionRows = await client.query<{
      key: string;
      count: number;
    }>(
      `SELECT u.acquisition_channel AS key, COUNT(*)::int AS count
       FROM app_users u
       WHERE u.created_at >= $1 AND u.created_at < $2 AND ${global.sql}
       GROUP BY u.acquisition_channel ORDER BY count DESC, key`,
      globalValues,
    );
    const sourceRows = await client.query<{ key: string; count: number }>(
      `SELECT COALESCE(NULLIF(lower(a.source), ''), 'unattributed') AS key,
              COUNT(*)::int AS count
       FROM app_users u
       LEFT JOIN user_acquisition_attribution a
         ON a.principal_id = u.principal_id
       WHERE u.created_at >= $1 AND u.created_at < $2 AND ${global.sql}
       GROUP BY key ORDER BY count DESC, key`,
      globalValues,
    );
    const campaignRows = await client.query<{ key: string; count: number }>(
      `SELECT COALESCE(NULLIF(lower(a.campaign), ''), 'unattributed') AS key,
              COUNT(*)::int AS count
       FROM app_users u
       LEFT JOIN user_acquisition_attribution a
         ON a.principal_id = u.principal_id
       WHERE u.created_at >= $1 AND u.created_at < $2 AND ${global.sql}
       GROUP BY key ORDER BY count DESC, key`,
      globalValues,
    );
    const onboardingDiscoveryRows = await client.query<{
      key: string;
      count: number;
    }>(
      `SELECT COALESCE(u.onboarding_discovery_source, 'unanswered') AS key,
              COUNT(*)::int AS count
       FROM app_users u
       WHERE u.created_at >= $1 AND u.created_at < $2 AND ${global.sql}
       GROUP BY key ORDER BY count DESC, key`,
      globalValues,
    );
    const current = userFilters(query, 1);
    const planRows = await client.query<{ key: string; count: number }>(
      `SELECT CASE WHEN e.plan_code IN ('pro','ultra') THEN e.plan_code
                   WHEN e.plan_code IS NULL OR e.plan_code = 'preview' THEN 'free'
                   ELSE 'unknown' END AS key,
              COUNT(*)::int AS count
       FROM app_users u LEFT JOIN entitlements e ON e.principal_id = u.principal_id
       WHERE ${current.sql}
       GROUP BY key ORDER BY count DESC, key`,
      [...current.values],
    );
    const statusRows = await client.query<{ key: string; count: number }>(
      `SELECT COALESCE(e.status, 'none') AS key, COUNT(*)::int AS count
       FROM app_users u LEFT JOIN entitlements e ON e.principal_id = u.principal_id
       WHERE ${current.sql}
       GROUP BY key ORDER BY count DESC, key`,
      [...current.values],
    );

    const retentionRows = await client.query<Record<string, unknown>>(
      `WITH ${CANONICAL_EVENTS_CTE}, horizons(days, label) AS (
         VALUES (1, 'D1'), (7, 'D7'), (30, 'D30')
       ), cohort AS (
         SELECT u.principal_id, u.created_at,
                (u.created_at AT TIME ZONE 'Asia/Seoul')::date AS cohort_day
         FROM app_users u
         WHERE u.created_at >= $1 AND u.created_at < $2 AND ${global.sql}
       )
       SELECT h.label, COUNT(*) FILTER (
           WHERE ((c.cohort_day + h.days + 1)::timestamp AT TIME ZONE 'Asia/Seoul') <= $2
         )::int AS eligible,
         COUNT(*) FILTER (
           WHERE ((c.cohort_day + h.days + 1)::timestamp AT TIME ZONE 'Asia/Seoul') <= $2
             AND EXISTS (
               SELECT 1 FROM canonical_events ce
               WHERE ce.principal_id = c.principal_id
                 AND ce.event_name IN ${MEANINGFUL_SQL}
                 AND ce.occurred_at >= ((c.cohort_day + h.days)::timestamp AT TIME ZONE 'Asia/Seoul')
                 AND ce.occurred_at < ((c.cohort_day + h.days + 1)::timestamp AT TIME ZONE 'Asia/Seoul')
             )
         )::int AS retained
       FROM cohort c CROSS JOIN horizons h
       GROUP BY h.days, h.label ORDER BY h.days`,
      globalValues,
    );

    const usageRows = await client.query<Record<string, unknown>>(
      `WITH ${CANONICAL_EVENTS_CTE}
       SELECT ce.event_name, COUNT(DISTINCT ce.event_key)::int AS events,
              COUNT(DISTINCT ce.principal_id)::int AS users
       FROM canonical_events ce
       JOIN app_users u ON u.principal_id = ce.principal_id
       WHERE ce.occurred_at >= $1 AND ce.occurred_at < $2
         AND ce.event_name IN ${MEANINGFUL_SQL} AND ${global.sql}
       GROUP BY ce.event_name ORDER BY events DESC, ce.event_name`,
      globalValues,
    );

    const paymentRows = await client.query<Record<string, unknown>>(
      `WITH ${CANONICAL_EVENTS_CTE}
       SELECT
         COUNT(DISTINCT event_key) FILTER (WHERE event_name = 'payment_succeeded')::int AS succeeded,
         COUNT(DISTINCT event_key) FILTER (WHERE event_name = 'payment_failed')::int AS failed,
         COUNT(DISTINCT event_key) FILTER (WHERE event_name = 'membership_deactivated')::int AS deactivated
       FROM canonical_events
       WHERE occurred_at >= $1 AND occurred_at < $2`,
      [query.from, query.to],
    );
    const subscriptionRows = await client.query<Record<string, unknown>>(
      `SELECT
         COUNT(*) FILTER (
           WHERE e.plan_code IN ('pro','ultra')
             AND e.cancel_at_period_end = true
             AND e.status IN ('active','trialing','past_due')
         )::int AS cancel_scheduled,
         COUNT(*) FILTER (WHERE e.status = 'past_due')::int AS past_due
       FROM entitlements e JOIN app_users u ON u.principal_id = e.principal_id
       WHERE ${current.sql}`,
      [...current.values],
    );
    const payments = paymentRows.rows[0] ?? {};
    const succeeded = number(payments["succeeded"]);
    const failed = number(payments["failed"]);
    const subscriptions = subscriptionRows.rows[0] ?? {};
    const users = await listUsersWithClient(client, query);

    return {
      generatedAt,
      query,
      status: {
        availability: "available",
        accuracy: "estimated",
        completeness: "partial",
        caveat:
          "기존 데이터는 추정치이며, 신규 이벤트는 계측 시작 이후 정확히 집계됩니다.",
      },
      kpis: {
        newUsers,
        dau: number(summaryRow["dau"]),
        wau: number(summaryRow["wau"]),
        mau: number(summaryRow["mau"]),
        signupToPaidRate: ratio(signupPaid, newUsers),
        activePaid: number(summaryRow["active_paid"]),
      },
      trends: trends.rows.map((row) => ({
        date: String(row["date"]),
        signups: number(row["signups"]),
        activeUsers: number(row["active_users"]),
        actions: number(row["actions"]),
        payments: number(row["payments"]),
      })),
      signupFunnel: {
        denominator: signupDenominator,
        activated,
        paid,
        activationRate: ratio(activated, signupDenominator),
        paidRate: ratio(paid, signupDenominator),
        status: {
          availability: "available",
          accuracy: "estimated",
          completeness: "partial",
          caveat: "과거 가입·결제 연결은 현재 구독 기록을 포함한 추정치입니다.",
        },
      },
      checkoutFunnel: {
        denominator: checkoutDenominator,
        paid: checkoutPaid,
        paidRate: ratio(checkoutPaid, checkoutDenominator),
        status: {
          availability: checkoutDenominator === 0 ? "unavailable" : "available",
          accuracy: "exact",
          completeness: "partial",
          caveat: "결제 이동 준비 이벤트 계측 시작 이후 데이터만 포함합니다.",
        },
      },
      acquisition: breakdown(acquisitionRows.rows, CHANNEL_LABELS),
      acquisitionSources: breakdown(sourceRows.rows, {
        unattributed: "미기록",
      }),
      acquisitionCampaigns: breakdown(campaignRows.rows, {
        unattributed: "미기록",
      }),
      onboardingDiscoverySources: breakdown(onboardingDiscoveryRows.rows, {
        ...ONBOARDING_DISCOVERY_SOURCE_LABELS_KO,
        unanswered: "미응답",
      }),
      plans: breakdown(planRows.rows, PLAN_LABELS),
      statuses: breakdown(statusRows.rows, STATUS_LABELS),
      retention: retentionRows.rows.map(
        (row): AdminRetention => ({
          horizon: String(row["label"]) as AdminRetention["horizon"],
          eligible: number(row["eligible"]),
          retained: number(row["retained"]),
          rate: ratio(number(row["retained"]), number(row["eligible"])),
        }),
      ),
      usage: usageRows.rows.map((row): AdminUsage => {
        const event = String(row["event_name"]) as AdminUsage["event"];
        return {
          event,
          label: analyticsEventLabels[event],
          events: number(row["events"]),
          users: number(row["users"]),
        };
      }),
      payments: {
        succeeded,
        failed,
        failureRate: ratio(failed, succeeded + failed),
        deactivated: number(payments["deactivated"]),
        cancelScheduled: number(subscriptions["cancel_scheduled"]),
        pastDue: number(subscriptions["past_due"]),
      },
      users,
    };
  });
}

export async function queryAdminUser(
  pool: Pool,
  principalId: string,
  query: AdminAnalyticsQuery,
): Promise<AdminUserDetail | undefined> {
  if (!/^[0-9a-f]{64}$/u.test(principalId)) return undefined;
  return await withReadTransaction(pool, async (client) => {
    const generated = await client.query<{ now: string }>(
      "SELECT transaction_timestamp() AS now",
    );
    const userResult = await client.query<Record<string, unknown>>(
      `WITH ${CANONICAL_EVENTS_CTE}
       SELECT u.principal_id, u.email, u.display_name, u.preferred_locale,
         u.acquisition_channel, u.onboarding_discovery_source,
         u.created_at, u.last_seen_at,
         a.source AS acquisition_source, a.medium AS acquisition_medium,
         a.campaign AS acquisition_campaign, a.term AS acquisition_term,
         a.content AS acquisition_content,
         a.referrer_host AS acquisition_referrer_host,
         a.landing_path AS acquisition_landing_path,
         a.captured_at AS acquisition_captured_at,
         CASE WHEN e.plan_code IN ('pro','ultra') THEN e.plan_code
              WHEN e.plan_code IS NULL OR e.plan_code = 'preview' THEN 'free'
              ELSE 'unknown' END AS plan,
         COALESCE(e.status, 'none') AS status,
         COUNT(ce.event_key) FILTER (
           WHERE ce.event_name IN ${MEANINGFUL_SQL}
             AND ce.occurred_at >= $2 AND ce.occurred_at < $3
         )::int AS action_count,
         MAX(ce.occurred_at) FILTER (
           WHERE ce.event_name IN ${MEANINGFUL_SQL}
             AND ce.occurred_at >= $2 AND ce.occurred_at < $3
         ) AS last_meaningful_at,
         MIN(ce.occurred_at) FILTER (
           WHERE ce.event_name = 'payment_succeeded'
         ) AS first_paid_at
       FROM app_users u
       LEFT JOIN entitlements e ON e.principal_id = u.principal_id
       LEFT JOIN user_acquisition_attribution a
         ON a.principal_id = u.principal_id
       LEFT JOIN canonical_events ce ON ce.principal_id = u.principal_id
       WHERE u.principal_id = $1
       GROUP BY u.principal_id, e.plan_code, e.status, a.principal_id`,
      [principalId, query.from, query.to],
    );
    const rawUser = userResult.rows[0];
    if (rawUser === undefined) return undefined;
    const timeline = await client.query<Record<string, unknown>>(
      `WITH ${CANONICAL_EVENTS_CTE}
       SELECT event_key, event_name, occurred_at
       FROM canonical_events
       WHERE principal_id = $1 AND occurred_at >= $2 AND occurred_at < $3
       ORDER BY occurred_at DESC, event_key DESC LIMIT 100`,
      [principalId, query.from, query.to],
    );
    return {
      generatedAt: iso(generated.rows[0]?.now) ?? new Date().toISOString(),
      user: mapUser(rawUser),
      timeline: timeline.rows.map((row) => {
        const event = String(row["event_name"]) as AdminUsage["event"];
        return {
          id: String(row["event_key"]),
          event,
          label: analyticsEventLabels[event],
          occurredAt: requiredIso(row["occurred_at"]),
        };
      }),
    };
  });
}
