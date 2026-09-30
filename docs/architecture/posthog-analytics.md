# Stocksembly PostHog

Project: https://us.posthog.com/project/637083

## Deployment

The public project token is in `src/lib/analytics/config.ts`. It is an ingestion
token, not a management credential. Production enables the integration by default;
`NEXT_PUBLIC_POSTHOG_ENABLED=false` is a build-time kill switch. For local testing,
set it to `true`. `STOCKSEMBLY_ADMIN_ANALYTICS_WRITES_ENABLED=true` must also be
present at runtime because the shared consent component uses this existing gate.
Do not use the default `.env.example` values unchanged in production.

Production deployment is separate from this change. The current
project is on the capped Free plan, with no payment method added.

## Events

| Event | Meaning |
| --- | --- |
| `$pageview` | Sanitized page visit |
| `page_engagement` | Incremental visible milliseconds; sum `visible_ms`, do not count rows as visits |
| `signup_confirmed` | Email confirmation completed (not OAuth registration) |
| `interests_saved` | Interests saved |
| `onboarding_completed` | Onboarding completed |
| `plans_opened` | Subscription modal opened |
| `research_started` | Research API accepted a run |
| `report_viewed` | Completed report component mounted with a report ID |
| `agent_question_sent` | Question API accepted a question |
| `checkout_started` | Checkout launch URL successfully received |
| `purchase_completed` | Verified Whop payment webhook, actual amount and currency |

Browser identities merge into the same SHA-256 pseudonymous account identifier
used by checkout metadata. Logout resets the browser identity. UTM source, medium,
campaign and content are retained as event properties; raw URLs lose their query
and fragment. Reports use route templates instead of report identifiers.

Purchases exclude sandbox and live-dollar test payments, require checkout consent,
and have a deterministic `$insert_id` for webhook deduplication. Missing actual
amount/currency is not replaced with a guessed subscription price. Delivery is
best-effort with a 3-second timeout, so analytics cannot block billing indefinitely.
It is not an accounting ledger and does not include refund reconciliation.

## Privacy and replay

Identified product analytics and replay start only after consent. Before a choice,
`aggregate_pageview` and `aggregate_engagement` count public-page activity through
our own server with an unrelated random identifier for every request and no person
profile. Only allowlisted page/channel/screen categories, visible seconds and scroll
buckets are forwarded. No browser identifiers, visitor IP/header forwarding, raw
URLs, financial content or persistent storage is used. GPC, DNT and explicit
rejection disable this path; granted consent switches to normal product analytics.
These events measure counts, not unique users or cross-page funnels. Existing
dashboards based on all events must exclude `measurement_mode=unlinked_aggregate`
when measuring unique users. Aggregate dashboards should use event totals instead.
The browser omits credentials and the referrer when posting these counts. Existing
first-party signup attribution is separate and unchanged. Analytics
preferences lets users withdraw consent. Autocapture, console logs, network
headers/bodies, performance capture, exception capture and surveys are disabled.
Replay masks all text, inputs and attributes and blocks images, video, canvas,
SVG and embedded frames. Authentication, admin, account, billing, checkout and
pages with non-allowlisted query parameters are not recorded. Public landings
with validated UTM labels remain eligible for replay. IP-based enrichment is disabled.

Replay is intentionally conservative: it shows layout/navigation rather than
readable private reports or messages. No new permission to collect prompts or
payment credentials is introduced. Existing GA/Meta behavior is unchanged.

## Analysis

Use Activity for individual ordered events, Web analytics for page acquisition,
and Session replay for masked recordings. Filter production analysis by host
`stocksembly.com` to exclude localhost setup traffic.

After production events arrive, save two 7-day sequential funnels:

1. `$pageview` → `onboarding_completed` → `research_started` → `report_viewed`.
2. `$pageview` → `checkout_started` → `purchase_completed`.

Break down the first step by `utm_campaign` / `utm_content` and device type.
The starter dashboard's autocapture funnel is only a template, not a configured
purchase funnel. It must not be interpreted as checkout conversion.

PostHog does not replace Meta attribution/ROAS. It has no ad-spend import here.
Cross-device journeys require signing into the same account, and rejected consent,
blockers and delivery failures leave gaps.

## Verification recorded during setup

- Local browser Pageview and page_engagement reached project 637083.
- UTM source `meta`, medium `paid_social`, campaign `posthog_setup_test` appeared.
- Recorded event URL omitted its query string.
- Focused tests and TypeScript check passed before deployment.
- Authenticated research/checkout was not run in the isolated worktree because it
  has no database/auth environment; production purchase delivery remains unverified.
