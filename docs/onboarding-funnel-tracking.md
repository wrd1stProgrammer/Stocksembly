# Onboarding sample funnel

Detailed events use the existing PostHog identity/session and require current analytics consent. No question text, email, or additional user identifier is sent. These diagnostic events are not Google Ads purchase conversions.

Recommended ordered funnel:

1. `onboarding_completed` (existing)
2. `onboarding_sample_requested`
3. `onboarding_sample_loaded`
4. `onboarding_sample_started` (office ready)
5. `onboarding_paywall_viewed`
6. `onboarding_paywall_plans_clicked`
7. `plans_opened` (existing plan modal)
8. `checkout_started` (existing checkout flow, not proof of payment)

Compare `onboarding_sample_completed` against `onboarding_sample_skipped` before the paywall. `completion_reason` distinguishes these paths on paywall events. Closing the plan selector emits `onboarding_plans_closed` and returning to the paywall emits another view; use unique users or sessions, not raw view counts, for conversion rates.

Additional diagnostics: `onboarding_sample_load_failed`, `onboarding_sample_progress` (25/50/75 percent of dialogue events), `onboarding_sample_paused`, `onboarding_sample_resumed`, `onboarding_sample_speed_changed`, `onboarding_paywall_dismissed`. Progress represents dialogue completion, not elapsed or active viewing time. Existing page engagement measures remain separate.

Sample load attempts include a zero-based `attempt`. Loaded/playback events include `sample_symbol` and `locale`; completion/skip events include progress and playback speed. Page closure is not inferred to mean a paywall dismissal. Events do not backfill historical sessions, and unlinked aggregate visits cannot be joined into this person-level funnel.
